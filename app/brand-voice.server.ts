import db from "./db.server";
import {
  generateBrandVoicePersonalityText,
  generateLivePreview,
  getAiModelOptions,
  getDefaultAiModelId,
  resolveAiModelId,
} from "./ai.server";
import { getCreditOverview } from "./credits.server";
import { getJudgeMeConnectionView } from "./judgeme.server";

type ImportedReply = {
  id: string;
  text: string;
  rating?: number | null;
  customer?: string | null;
  product?: string | null;
  source: string;
};

const DEFAULT_PERSONALITY =
  "I speak with a warm, human, and attentive voice. I notice the real detail in each customer's review and sound present rather than scripted. I stay grounded in what the customer actually said, avoid exaggerated praise, and do not invent details that were not provided. When something goes wrong, I acknowledge it directly and keep the response calm, honest, and useful.";
const DEFAULT_GREETING = "Hi {name} -";
const DEFAULT_SIGN_OFF = "- The team";
const DEFAULT_ALWAYS_MENTION = ["product detail", "what the customer noticed", "next step when needed"];
const DEFAULT_AVOID_PHRASES = ["valued customer", "reach out", "we strive"];
const DEFAULT_PERSONALITY_STYLE = "use_personality";
const DEFAULT_PERSONALITY_STRENGTH = "balanced";
const DEFAULT_REPLY_LENGTH = "adaptive";
const DEFAULT_PREVIEW_RATING = 5;
const DEFAULT_PREVIEW_REVIEW =
  "Obsessed with these napkins. The fabric feels substantial, the print looks even better in person, and they made our dinner table feel special.";
const PERSONALITY_MAX_WORDS = 200;
const PERSONALITY_MAX_CHARS = 1400;

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function normalizeRating(value: unknown) {
  const rating = readNumber(value);
  if (!rating) return DEFAULT_PREVIEW_RATING;
  return Math.max(1, Math.min(5, Math.round(rating)));
}

function readStringListJson(value: string | null | undefined, fallback: string[]) {
  if (!value) return fallback;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return fallback;

    const values = parsed
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return values.length ? values : fallback;
  } catch {
    return fallback;
  }
}

function cleanStringList(values: string[] | undefined, fallback: string[]) {
  const seen = new Set<string>();
  const cleaned =
    values
      ?.map((value) => value.trim())
      .filter((value) => {
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 30) ?? [];

  return cleaned.length ? cleaned : fallback;
}

function limitPersonalityText(value: string | null | undefined, fallback = DEFAULT_PERSONALITY) {
  const text = (value?.trim() || fallback).slice(0, PERSONALITY_MAX_CHARS);
  const parts = text.match(/\S+\s*/g) ?? [];
  if (parts.length <= PERSONALITY_MAX_WORDS) return text;
  return parts.slice(0, PERSONALITY_MAX_WORDS).join("").trimEnd();
}

function mapBrandVoiceSettings(
  settings: Awaited<ReturnType<typeof db.brandVoiceSetting.findUnique>> | null,
) {
  return {
    persona: limitPersonalityText(settings?.personality),
    greeting: settings?.greeting || DEFAULT_GREETING,
    signOff: settings?.signOff || DEFAULT_SIGN_OFF,
    alwaysMention: readStringListJson(settings?.alwaysMentionJson, DEFAULT_ALWAYS_MENTION),
    avoidPhrases: readStringListJson(settings?.avoidPhrasesJson, DEFAULT_AVOID_PHRASES),
    selectedModel: resolveAiModelId(settings?.selectedModel || getDefaultAiModelId()),
    livePreview: settings?.livePreview || "",
    previewReview: settings?.previewReview || DEFAULT_PREVIEW_REVIEW,
    previewProductId: settings?.previewProductId || "",
    previewProductTitle: settings?.previewProductTitle || "",
    previewProductType: settings?.previewProductType || "",
    previewProductTags: readStringListJson(settings?.previewProductTagsJson, []),
    previewRating: normalizeRating(settings?.previewRating),
    personalityStyle: settings?.personalityStyle || DEFAULT_PERSONALITY_STYLE,
    personalityStrength: settings?.personalityStrength || DEFAULT_PERSONALITY_STRENGTH,
    replyLength: settings?.replyLength || DEFAULT_REPLY_LENGTH,
  };
}

export async function loadBrandVoicePageData(shop: string) {
  const [connection, recentSentReplies, settings, aiModels, credits] = await Promise.all([
    getJudgeMeConnectionView(shop),
    db.reviewDraft.findMany({
      where: { shop, status: "sent" },
      orderBy: [{ sentAt: "desc" }, { updatedAt: "desc" }],
      take: 10,
    }),
    db.brandVoiceSetting.findUnique({ where: { shop } }),
    getAiModelOptions(),
    getCreditOverview(shop),
  ]);
  const settingsView = mapBrandVoiceSettings(settings);

  return {
    connection,
    settings: settingsView,
    recentSentReplies: recentSentReplies.map((reply, index) => ({
      id: reply.id,
      text: reply.draft,
      rating: reply.rating,
      customer: reply.customerName,
      product: reply.productTitle,
      source: index === 0 ? "Latest ReplyPulse AI: Review Replies reply" : "ReplyPulse AI: Review Replies sent reply",
    })),
    aiModels,
    credits,
    defaultAiModelId: getDefaultAiModelId(),
  };
}

export async function loadSentReplyExamplesForBrandVoice(shop: string, limit: number) {
  const safeLimit = Math.max(5, Math.min(limit || 10, 50));
  const sentReplies = await db.reviewDraft.findMany({
    where: { shop, status: "sent" },
    orderBy: [{ sentAt: "desc" }, { updatedAt: "desc" }],
    take: safeLimit,
  });

  return {
    importedReplies: sentReplies.map((reply, index) => ({
      id: `sent-${reply.id}`,
      text: reply.draft,
      rating: reply.rating,
      customer: reply.customerName,
      product: reply.productTitle,
      source: index === 0 ? "Latest sent Judge.me reply" : "Sent Judge.me reply",
    })),
    importedCount: sentReplies.length,
    requestedCount: safeLimit,
  };
}

export async function generateBrandVoicePersonality(input: {
  modelId?: string | null;
  replies: ImportedReply[];
  personality?: string;
  greeting?: string;
  signOff?: string;
  alwaysMention?: string[];
  avoidPhrases?: string[];
  previewReview?: string;
  previewRating?: number;
  previewProductTitle?: string;
  previewProductType?: string;
  previewProductTags?: string[];
  previewProductDescription?: string;
  personalityStyle?: string;
  personalityStrength?: string;
  replyLength?: string;
}) {
  const personalityResult = await generateBrandVoicePersonalityText({
    modelId: input.modelId,
    replies: input.replies,
    context: {
      personality: limitPersonalityText(input.personality),
      greeting: input.greeting,
      signOff: input.signOff,
      alwaysMention: input.alwaysMention,
      avoidPhrases: input.avoidPhrases,
      previewReview: input.previewReview,
      previewRating: input.previewRating,
      previewProductTitle: input.previewProductTitle,
      previewProductType: input.previewProductType,
      previewProductTags: input.previewProductTags,
      previewProductDescription: input.previewProductDescription,
      personalityStyle: input.personalityStyle,
      personalityStrength: input.personalityStrength,
      replyLength: input.replyLength,
    },
  });
  const previewResult = await generateLivePreview({
    modelId: input.modelId,
    context: {
      personality: personalityResult.personality,
      greeting: input.greeting,
      signOff: input.signOff,
      alwaysMention: input.alwaysMention,
      avoidPhrases: input.avoidPhrases,
      previewReview: input.previewReview,
      previewRating: input.previewRating,
      previewProductTitle: input.previewProductTitle,
      previewProductType: input.previewProductType,
      previewProductTags: input.previewProductTags,
      previewProductDescription: input.previewProductDescription,
      personalityStyle: input.personalityStyle,
      personalityStrength: input.personalityStrength,
      replyLength: input.replyLength,
    },
  });

  return {
    personality: personalityResult.personality,
    livePreview: previewResult.livePreview,
    model: personalityResult.model,
  };
}

export async function saveBrandVoiceSettings(
  shop: string,
  input: {
    personality?: string;
    greeting?: string;
    signOff?: string;
    alwaysMention?: string[];
    avoidPhrases?: string[];
    selectedModel?: string;
    livePreview?: string;
    previewReview?: string;
    previewProductId?: string;
    previewProductTitle?: string;
    previewProductType?: string;
    previewProductTags?: string[];
    previewRating?: number;
    personalityStyle?: string;
    personalityStrength?: string;
    replyLength?: string;
  },
) {
  const data = {
    personality: limitPersonalityText(input.personality),
    greeting: input.greeting?.trim() || DEFAULT_GREETING,
    signOff: input.signOff?.trim() || DEFAULT_SIGN_OFF,
    alwaysMentionJson: JSON.stringify(cleanStringList(input.alwaysMention, DEFAULT_ALWAYS_MENTION)),
    avoidPhrasesJson: JSON.stringify(cleanStringList(input.avoidPhrases, DEFAULT_AVOID_PHRASES)),
    selectedModel: resolveAiModelId(input.selectedModel?.trim() || getDefaultAiModelId()),
    livePreview: input.livePreview?.trim() || null,
    previewReview: input.previewReview?.trim() || DEFAULT_PREVIEW_REVIEW,
    previewProductId: input.previewProductId?.trim() || null,
    previewProductTitle: input.previewProductTitle?.trim() || null,
    previewProductType: input.previewProductType?.trim() || null,
    previewProductTagsJson: JSON.stringify(cleanStringList(input.previewProductTags, [])),
    previewRating: normalizeRating(input.previewRating),
    personalityStyle: input.personalityStyle?.trim() || DEFAULT_PERSONALITY_STYLE,
    personalityStrength: input.personalityStrength?.trim() || DEFAULT_PERSONALITY_STRENGTH,
    replyLength: input.replyLength?.trim() || DEFAULT_REPLY_LENGTH,
  };

  const settings = await db.brandVoiceSetting.upsert({
    where: { shop },
    update: data,
    create: {
      shop,
      ...data,
    },
  });

  return mapBrandVoiceSettings(settings);
}

export async function generateBrandVoicePreview(input: {
  modelId?: string | null;
  personality?: string;
  greeting?: string;
  signOff?: string;
  alwaysMention?: string[];
  avoidPhrases?: string[];
  previewReview?: string;
  previewRating?: number;
  previewProductTitle?: string;
  previewProductType?: string;
  previewProductTags?: string[];
  previewProductDescription?: string;
  personalityStyle?: string;
  personalityStrength?: string;
  replyLength?: string;
}) {
  return generateLivePreview({
    modelId: input.modelId,
    context: {
      personality: limitPersonalityText(input.personality),
      greeting: input.greeting,
      signOff: input.signOff,
      alwaysMention: input.alwaysMention,
      avoidPhrases: input.avoidPhrases,
      previewReview: input.previewReview,
      previewRating: input.previewRating,
      previewProductTitle: input.previewProductTitle,
      previewProductType: input.previewProductType,
      previewProductTags: input.previewProductTags,
      previewProductDescription: input.previewProductDescription,
      personalityStyle: input.personalityStyle,
      personalityStrength: input.personalityStrength,
      replyLength: input.replyLength,
    },
  });
}
