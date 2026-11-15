import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    automation: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    instagramAccount: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: vi.fn() }));
vi.mock("@/lib/workspace-access", () => ({
  canManageWorkspace: () => true,
  getCurrentWorkspaceContext: vi.fn(async () => ({
    workspaceId: "workspace_123",
    role: "OWNER",
  })),
}));
vi.mock("@/lib/campaigns/links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/campaigns/links")>()),
  syncCampaignLinks: vi.fn(),
}));

import { PATCH } from "../app/api/automations/route";

function patch(body: unknown) {
  return PATCH(
    new NextRequest("https://example.com/api/automations?id=automation_123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function savedData() {
  return mockPrisma.automation.update.mock.calls[0][0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.automation.findFirst.mockResolvedValue({
    id: "automation_123",
    workspaceId: "workspace_123",
    instagramAccountId: "account_1",
  });
  mockPrisma.automation.update.mockImplementation(async ({ data }) => ({
    id: "automation_123",
    ...data,
  }));
  mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
});

describe("campaigns covering several posts", () => {
  it("stores every picked post and makes the first one the primary post", async () => {
    const response = await patch({
      postIds: ["post_a", "post_b", "post_a", "post_c"],
    });

    expect(response.status).toBe(200);
    expect(savedData()).toMatchObject({
      postId: "post_a",
      postIds: ["post_a", "post_b", "post_c"],
    });
  });

  it("turns a lone postId from an older client into a list of one", async () => {
    await patch({ postId: "post_a" });

    expect(savedData()).toMatchObject({ postId: "post_a", postIds: ["post_a"] });
  });

  it("clears the posts when the campaign switches to any post", async () => {
    await patch({ matchAnyPost: true, postIds: ["post_a"] });

    expect(savedData()).toMatchObject({ postId: null, postIds: [] });
  });

  it("rejects more than 20 posts", async () => {
    const response = await patch({
      postIds: Array.from({ length: 21 }, (_, i) => `post_${i}`),
    });

    expect(response.status).toBe(400);
    expect(mockPrisma.automation.update).not.toHaveBeenCalled();
  });
});
