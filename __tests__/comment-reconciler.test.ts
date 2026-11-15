/**
 * Comment reconciliation — ad copies of a boosted post.
 *
 * Comments left on an ad carry the ad's own media id, so the sweep has to look
 * at those media too or a webhook Meta never delivers is lost for good.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, queueAdd, readComments } = vi.hoisted(() => ({
  mockPrisma: {
    $queryRaw: vi.fn(),
    automation: { findMany: vi.fn() },
    dmLog: { findMany: vi.fn() },
    operationalEvent: { create: vi.fn() },
  },
  queueAdd: vi.fn(),
  readComments: vi.fn(),
}));
vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({ add: queueAdd }),
}));
vi.mock("@/lib/instagram/provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/instagram/provider")>()),
  createInstagramContext: async () => ({
    provider: "META",
    accessToken: "local-test",
  }),
  getRecentMediaComments: readComments,
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));

import {
  adMediaFor,
  reconcileComments,
  resetOldCommentSweepClock,
} from "../lib/polling/comment-reconciler";

const POST = "18023946917554990";
const AD = "17899788633163100";

describe("adMediaFor", () => {
  beforeEach(() => {
    mockPrisma.$queryRaw.mockReset();
  });

  it("returns the ad media ids seen for the post", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ mediaId: AD }]);
    await expect(adMediaFor(POST)).resolves.toEqual([AD]);
  });

  it("never returns the post itself, so it is not swept twice", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { mediaId: AD },
      { mediaId: POST },
    ]);
    await expect(adMediaFor(POST)).resolves.toEqual([AD]);
  });

  it("drops rows without a media id", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { mediaId: null },
      { mediaId: AD },
    ]);
    await expect(adMediaFor(POST)).resolves.toEqual([AD]);
  });

  it("returns nothing when the post was never boosted", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await expect(adMediaFor(POST)).resolves.toEqual([]);
  });

  it("swallows a query failure, leaving the post itself still swept", async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error("connection lost"));
    await expect(adMediaFor(POST)).resolves.toEqual([]);
  });
});

describe("comment polling does not recreate unsafe sends", () => {
  beforeEach(() => {
    queueAdd.mockReset();
    mockPrisma.operationalEvent.create.mockResolvedValue({});
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        id: "campaign",
        name: "Campaign",
        workspaceId: "workspace",
        postId: POST,
        matchAnyWord: false,
        keywords: ["AI"],
        publicReplyEnabled: true,
        instagramAccount: {
          id: "connection",
          instagramId: "owner",
          provider: "META",
          accessToken: "test",
        },
      },
    ]);
    readComments.mockResolvedValue([
      {
        id: "old",
        text: "AI",
        from: { id: "reader" },
        timestamp: new Date().toISOString(),
      },
      {
        id: "new",
        text: "AI",
        from: { id: "another-reader" },
        timestamp: new Date().toISOString(),
      },
    ]);
  });
  it.each([
    { status: "FAILED", attempts: 1, dmDeliveryUnconfirmed: true },
    { status: "FAILED", attempts: 3, dmDeliveryUnconfirmed: false },
    {
      status: "FAILED",
      attempts: 1,
      errorMessage: "MetaApiError 1: An unknown error has occurred.",
    },
    { status: "PENDING", attempts: 1, dmDeliveryUnconfirmed: true },
  ])(
    "leaves an unsafe old comment alone while continuing new comments: %j",
    async (state) => {
      mockPrisma.dmLog.findMany.mockResolvedValue([
        { commentId: "old", publicReplySentAt: new Date(), ...state },
      ]);
      await reconcileComments();
      await reconcileComments();
      expect(queueAdd).toHaveBeenCalledTimes(2);
      for (const [, data] of queueAdd.mock.calls)
        expect(data.commentId).toBe("new");
    },
  );
});

describe("comment polling covers every post of a multi-post campaign", () => {
  const SECOND = "18011111111111111";

  beforeEach(() => {
    queueAdd.mockReset();
    readComments.mockReset();
    mockPrisma.operationalEvent.create.mockResolvedValue({});
    mockPrisma.dmLog.findMany.mockResolvedValue([]);
    // The second post was boosted: its ad copy must map back to it.
    mockPrisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, postId: string) =>
      postId === SECOND ? [{ mediaId: AD }] : []
    );
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        id: "campaign",
        name: "Campaign",
        workspaceId: "workspace",
        postId: POST,
        postIds: [POST, SECOND],
        matchAnyWord: false,
        keywords: ["AI"],
        publicReplyEnabled: false,
        instagramAccount: {
          id: "connection",
          instagramId: "owner",
          provider: "META",
          accessToken: "test",
        },
      },
    ]);
    readComments.mockImplementation(async ({ mediaId }: { mediaId: string }) => [
      {
        id: `comment-on-${mediaId}`,
        text: "AI",
        from: { id: `reader-${mediaId}` },
        timestamp: new Date().toISOString(),
      },
    ]);
  });

  it("sweeps both posts and the ad copy, tagging the ad with its own post", async () => {
    await reconcileComments();

    const swept = readComments.mock.calls.map(([args]) => args.mediaId);
    expect(swept).toEqual([POST, SECOND, AD]);

    const jobs = queueAdd.mock.calls.map(([, data]) => data);
    expect(jobs.map((j) => j.mediaId)).toEqual([POST, SECOND, AD]);
    expect(jobs.find((j) => j.mediaId === AD)?.originalMediaId).toBe(SECOND);
    expect(jobs.find((j) => j.mediaId === SECOND)?.originalMediaId).toBeUndefined();
  });
});

describe("old-comment sweep (past the 7-day DM window)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

  beforeEach(() => {
    process.env.COMMENT_OLD_REPLY_LOOKBACK_DAYS = "90";
    process.env.COMMENT_OLD_REPLY_MAX_PER_SWEEP = "2";
    process.env.COMMENT_OLD_REPLY_SPACING_MS = "20000";
    resetOldCommentSweepClock();
    queueAdd.mockReset();
    readComments.mockReset();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.operationalEvent.create.mockResolvedValue({});
    mockPrisma.dmLog.findMany.mockResolvedValue([]);
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        id: "campaign",
        name: "Campaign",
        workspaceId: "workspace",
        postId: POST,
        postIds: [POST],
        matchAnyWord: true,
        keywords: [],
        publicReplyEnabled: true,
        instagramAccount: { id: "connection", instagramId: "owner", provider: "META", accessToken: "test" },
      },
    ]);
    readComments.mockImplementation(async ({ sinceMs }: { sinceMs: number }) =>
      [
        { id: "recent", text: "price", from: { id: "a" }, timestamp: ago(1) },
        { id: "two-weeks", text: "price", from: { id: "b" }, timestamp: ago(14) },
        { id: "month", text: "price", from: { id: "c" }, timestamp: ago(30) },
        { id: "five-weeks", text: "price", from: { id: "d" }, timestamp: ago(35) },
        {
          id: "answered",
          text: "price",
          from: { id: "e" },
          timestamp: ago(20),
          replies: { data: [{ from: { id: "owner" } }] },
        },
      ].filter((c) => Date.parse(c.timestamp) >= sinceMs)
    );
  });

  afterEach(() => {
    delete process.env.COMMENT_OLD_REPLY_LOOKBACK_DAYS;
    delete process.env.COMMENT_OLD_REPLY_MAX_PER_SWEEP;
    delete process.env.COMMENT_OLD_REPLY_SPACING_MS;
  });

  it("queues old comments as public-only, oldest first, capped and spaced out", async () => {
    await reconcileComments();
    const calls = queueAdd.mock.calls;
    const dm = calls.filter(([, data]) => !data.publicOnly).map(([, d]) => d.commentId);
    const old = calls.filter(([, data]) => data.publicOnly);
    expect(dm).toEqual(["recent"]);
    expect(old.map(([, d]) => d.commentId)).toEqual(["five-weeks", "month"]);
    expect(old.map(([, , opts]) => opts.delay)).toEqual([0, 20000]);
  });

  it("skips comments the account already answered or that were handled", async () => {
    mockPrisma.dmLog.findMany.mockResolvedValue([
      { commentId: "five-weeks", status: "FAILED", publicReplySentAt: new Date() },
      { commentId: "month", status: "FAILED", publicReplyError: "Meta 100" },
    ]);
    await reconcileComments();
    const old = queueAdd.mock.calls.filter(([, d]) => d.publicOnly).map(([, d]) => d.commentId);
    expect(old).toEqual(["two-weeks"]);
  });

  it("runs the old sweep only once per interval", async () => {
    await reconcileComments();
    await reconcileComments();
    expect(queueAdd.mock.calls.filter(([, d]) => d.publicOnly)).toHaveLength(2);
  });

  it("does nothing for old comments when it is not configured", async () => {
    delete process.env.COMMENT_OLD_REPLY_LOOKBACK_DAYS;
    await reconcileComments();
    expect(queueAdd.mock.calls.filter(([, d]) => d.publicOnly)).toHaveLength(0);
  });
});
