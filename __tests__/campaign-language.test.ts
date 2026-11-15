import { describe, expect, it } from "vitest";
import {
  buildLanguageChoice,
  DEFAULT_LANGUAGE_PROMPT,
  localizeCampaign,
  parsePostbackPayload,
  withLanguage,
} from "@/lib/campaigns/language";

describe("parsePostbackPayload", () => {
  it("reads language buttons", () => {
    expect(parsePostbackPayload("lang:ar:abc")).toEqual({
      kind: "lang",
      automationId: "abc",
      fromOpeningDm: true,
      language: "ar",
    });
  });

  it("keeps payloads written before language choice working as English", () => {
    expect(parsePostbackPayload("followcheck:abc")).toEqual({
      kind: "followcheck",
      automationId: "abc",
      fromOpeningDm: false,
      language: "en",
    });
    expect(parsePostbackPayload("reveal:abc:open")).toEqual({
      kind: "reveal",
      automationId: "abc",
      fromOpeningDm: true,
      language: "en",
    });
  });

  it("reads the Arabic marker on follow-check payloads", () => {
    expect(parsePostbackPayload(withLanguage("followcheck:abc", "ar"))).toEqual({
      kind: "followcheck",
      automationId: "abc",
      fromOpeningDm: false,
      language: "ar",
    });
    expect(withLanguage("followcheck:abc", "en")).toBe("followcheck:abc");
  });

  it("ignores unknown payloads and languages", () => {
    expect(parsePostbackPayload("something:abc")).toBeNull();
    expect(parsePostbackPayload("lang:fr:abc")).toBeNull();
    expect(parsePostbackPayload("lang:ar")).toBeNull();
  });
});

describe("localizeCampaign", () => {
  const campaign = {
    dmMessage: "Hello",
    linkButtonLabel: "Open",
    followPromptMessage: "Follow first",
    followPromptButtonLabel: "Following",
    followUpMessage: "Thanks",
    dmMessageAr: "مرحبا",
    linkButtonLabelAr: "  ",
    followPromptMessageAr: null,
    followPromptButtonLabelAr: "تابعت",
    followUpMessageAr: "شكرا",
  };

  it("uses Arabic texts and falls back to English for empty ones", () => {
    expect(localizeCampaign(campaign, "ar")).toEqual({
      dmMessage: "مرحبا",
      linkButtonLabel: "Open",
      followPromptMessage: "Follow first",
      followPromptButtonLabel: "تابعت",
      followUpMessage: "شكرا",
    });
  });

  it("returns the English texts for English", () => {
    expect(localizeCampaign(campaign, "en").dmMessage).toBe("Hello");
  });
});

describe("buildLanguageChoice", () => {
  it("falls back to default prompt and labels", () => {
    expect(
      buildLanguageChoice({
        id: "abc",
        languagePromptMessage: null,
        englishButtonLabel: "",
        arabicButtonLabel: null,
      })
    ).toEqual({
      text: DEFAULT_LANGUAGE_PROMPT,
      buttons: [
        { title: "English", payload: "lang:en:abc" },
        { title: "العربية", payload: "lang:ar:abc" },
      ],
    });
  });
});
