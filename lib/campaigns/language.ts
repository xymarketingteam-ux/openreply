/**
 * Language choice for campaigns.
 *
 * When a campaign has `languageChoiceEnabled`, its first DM carries two
 * postback buttons (English / Arabic). The chosen language then travels inside
 * every later button payload and the follow-up job, so the follow prompt, the
 * link DM and the follow-up all go out in that language.
 *
 * Payload grammar (automation ids are cuids and contain no colon):
 *   lang:<en|ar>:<automationId>            language button
 *   followcheck:<automationId>[:open][:ar] follow-gate button
 *   reveal:<automationId>[:open][:ar]      reveal button
 * Payloads written before this feature carry no language marker and read as
 * English, so they keep working unchanged.
 */

export type CampaignLanguage = "en" | "ar";

export const DEFAULT_LANGUAGE_PROMPT =
  "Please choose your language 👇\nيرجى اختيار اللغة 👇";
export const DEFAULT_ENGLISH_BUTTON_LABEL = "English";
export const DEFAULT_ARABIC_BUTTON_LABEL = "العربية";

export interface ParsedPostback {
  kind: "followcheck" | "reveal" | "lang";
  automationId: string;
  fromOpeningDm: boolean;
  language: CampaignLanguage;
}

export function languagePayload(
  language: CampaignLanguage,
  automationId: string
): string {
  return `lang:${language}:${automationId}`;
}

/** Append the language marker to a followcheck/reveal payload (English adds none). */
export function withLanguage(
  payload: string,
  language: CampaignLanguage
): string {
  return language === "ar" ? `${payload}:ar` : payload;
}

export function parsePostbackPayload(payload: string): ParsedPostback | null {
  if (payload.startsWith("lang:")) {
    const [code, automationId] = payload.slice("lang:".length).split(":");
    if (!automationId || (code !== "en" && code !== "ar")) return null;
    // A language tap is the first tap in the conversation, like an opening-DM
    // tap: a non-follower is prompted right away, not held for a re-check.
    return { kind: "lang", automationId, fromOpeningDm: true, language: code };
  }

  const kind = payload.startsWith("followcheck:")
    ? "followcheck"
    : payload.startsWith("reveal:")
      ? "reveal"
      : null;
  if (!kind) return null;

  const [automationId, ...markers] = payload
    .slice(kind.length + 1)
    .split(":");
  if (!automationId) return null;
  return {
    kind,
    automationId,
    fromOpeningDm: markers.includes("open"),
    language: markers.includes("ar") ? "ar" : "en",
  };
}

export interface LocalizableCampaign {
  dmMessage: string;
  linkButtonLabel: string | null;
  followPromptMessage: string | null;
  followPromptButtonLabel: string | null;
  followUpMessage: string | null;
  dmMessageAr?: string | null;
  linkButtonLabelAr?: string | null;
  followPromptMessageAr?: string | null;
  followPromptButtonLabelAr?: string | null;
  followUpMessageAr?: string | null;
}

export interface LocalizedTexts {
  dmMessage: string;
  linkButtonLabel: string | null;
  followPromptMessage: string | null;
  followPromptButtonLabel: string | null;
  followUpMessage: string | null;
}

function pick(arabic: string | null | undefined, english: string | null) {
  return arabic?.trim() ? arabic : english;
}

/**
 * The campaign's texts in one language. Arabic texts fall back to the English
 * ones when empty, so a half-translated campaign still sends something.
 */
export function localizeCampaign(
  campaign: LocalizableCampaign,
  language: CampaignLanguage
): LocalizedTexts {
  if (language !== "ar") {
    return {
      dmMessage: campaign.dmMessage,
      linkButtonLabel: campaign.linkButtonLabel,
      followPromptMessage: campaign.followPromptMessage,
      followPromptButtonLabel: campaign.followPromptButtonLabel,
      followUpMessage: campaign.followUpMessage,
    };
  }
  return {
    dmMessage: pick(campaign.dmMessageAr, campaign.dmMessage) as string,
    linkButtonLabel: pick(campaign.linkButtonLabelAr, campaign.linkButtonLabel),
    followPromptMessage: pick(
      campaign.followPromptMessageAr,
      campaign.followPromptMessage
    ),
    followPromptButtonLabel: pick(
      campaign.followPromptButtonLabelAr,
      campaign.followPromptButtonLabel
    ),
    followUpMessage: pick(campaign.followUpMessageAr, campaign.followUpMessage),
  };
}

export interface LanguageChoiceCampaign {
  id: string;
  languagePromptMessage: string | null;
  englishButtonLabel: string | null;
  arabicButtonLabel: string | null;
}

/** Text and buttons of the "choose your language" DM. */
export function buildLanguageChoice(campaign: LanguageChoiceCampaign) {
  return {
    text: campaign.languagePromptMessage?.trim() || DEFAULT_LANGUAGE_PROMPT,
    buttons: [
      {
        title:
          campaign.englishButtonLabel?.trim() || DEFAULT_ENGLISH_BUTTON_LABEL,
        payload: languagePayload("en", campaign.id),
      },
      {
        title: campaign.arabicButtonLabel?.trim() || DEFAULT_ARABIC_BUTTON_LABEL,
        payload: languagePayload("ar", campaign.id),
      },
    ],
  };
}
