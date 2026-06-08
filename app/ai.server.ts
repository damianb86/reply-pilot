import db from "./db.server";
import { creditCostsForModel } from "./credits.server";

type AiProvider = "openai" | "google";

type AiModelConfig = {
  id: string;
  provider: AiProvider;
  providerName: string;
  name: string;
  model: string;
  envKey: string;
  visibleInProduction?: boolean;
  bestFor: string;
  description: string;
  detail: string;
  strengths: string[];
};

type GeminiPoolModel = {
  id: string;
  name: string;
  model: string;
  detail: string;
};

type RuntimeModel = {
  id: string;
  name: string;
  provider: string;
  model: string;
};

type ProviderTextResult = {
  text: string;
  runtimeModel?: RuntimeModel;
};

type ImportedReply = {
  text: string;
  rating?: number | null;
  customer?: string | null;
  product?: string | null;
  source?: string | null;
};

type BrandVoiceContext = {
  personality?: string;
  greeting?: string;
  signOff?: string;
  alwaysMention?: string[];
  avoidPhrases?: string[];
  previewReview?: string;
  previewRating?: number | string | null;
  previewProductTitle?: string | null;
  previewProductType?: string | null;
  previewProductTags?: string[];
  previewProductDescription?: string | null;
  personalityStyle?: string;
  personalityStrength?: string;
  replyLength?: string;
};

type ReviewReplyContext = {
  personality?: string;
  greeting?: string;
  signOff?: string;
  alwaysMention?: string[];
  avoidPhrases?: string[];
  personalityStyle?: string;
  personalityStrength?: string;
  replyLength?: string;
  customerName?: string | null;
  reviewBody: string;
  rating?: number | null;
  productTitle?: string | null;
  productType?: string | null;
  productTags?: string[];
  productDescription?: string | null;
  nudge?: string | null;
};

type ReviewReplyRevisionContext = ReviewReplyContext & {
  currentDraft: string;
  instruction: string;
};

type GenerateTextOptions = {
  responseFormat?: "json" | "text";
  maxTokens?: number;
  system?: string;
  temperature?: number;
  textVerbosity?: "low" | "medium" | "high";
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
};

const TONE_PRESET_INSTRUCTIONS: Record<string, string> = {
  use_personality: "Use personality: do not add an extra tone nudge; follow the Personality field as the source of truth.",
  balanced: "Use personality: do not add an extra tone nudge; follow the Personality field as the source of truth.",
  formal: "More formal: add polish, restraint, and precise wording while preserving the Personality field.",
  casual: "More casual: make wording more relaxed and conversational while preserving the Personality field.",
  warm: "Warmer: add more appreciation and emotional presence where appropriate while preserving the Personality field.",
  playful: "More playful: add light charm or wit only when the review gives room for it.",
  direct: "More direct: keep wording practical, clear, and low-friction while preserving the Personality field.",
  premium: "More premium: make wording more composed, refined, and detail-aware while preserving the Personality field.",
};

const PERSONALITY_STRENGTH_INSTRUCTIONS: Record<string, string> = {
  subtle: "Subtle: lightly apply the voice; prioritize clarity over character.",
  balanced: "Balanced: make the voice noticeable without overwhelming the message.",
  expressive: "Expressive: make the voice more distinctive while staying credible and professional.",
};

const REPLY_LENGTH_INSTRUCTIONS: Record<string, { label: string; instruction: string; maxTokens: number }> = {
  adaptive: {
    label: "Adaptive",
    instruction:
      "Choose the reply length based on review complexity: usually 1-4 sentences before the sign-off, shorter for simple positive reviews and fuller only for nuanced, mixed, or negative reviews.",
    maxTokens: 2200,
  },
  short: {
    label: "Short",
    instruction: "Write a short reply: 1-2 compact sentences before the sign-off.",
    maxTokens: 900,
  },
  medium: {
    label: "Medium",
    instruction: "Write a medium reply: 2-4 developed sentences before the sign-off.",
    maxTokens: 1600,
  },
  long: {
    label: "Long",
    instruction: "Write a long reply: 4-6 thoughtful sentences before the sign-off.",
    maxTokens: 2800,
  },
  very_long: {
    label: "Very long",
    instruction: "Write a detailed support-style reply before the sign-off, without filler. Use only for complex public responses.",
    maxTokens: 4096,
  },
};

const DEFAULT_JSON_MAX_TOKENS = 1600;
const DEFAULT_TEXT_MAX_TOKENS = 1600;
const DEFAULT_AI_PROVIDER_TIMEOUT_MS = 45000;
const PERSONALITY_MAX_TOKENS = 4096;
const PERSONALITY_DESCRIPTION_MAX_WORDS = 200;
const PERSONALITY_DESCRIPTION_MAX_CHARS = 1400;
const GEMINI_RETRY_MAX_TOKENS = 8192;
const DEFAULT_PREVIEW_REVIEW =
  "Obsessed with these napkins. The fabric feels substantial, the print looks even better in person, and they made our dinner table feel special.";

const APP_ENV = process.env.APP_ENV || process.env.NODE_ENV || "development";
const IS_PRODUCTION = APP_ENV === "production";
const GEMINI_POOL_PROVIDER = "google-gemini";
const GEMINI_DAILY_RESET_TIME_ZONE =
  process.env.AI_DAILY_RESET_TIME_ZONE || "America/Argentina/Cordoba";
const GEMINI_POOL: GeminiPoolModel[] = [
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    model: process.env.GEMINI_MODEL_1 || process.env.GEMINI_MODEL || "gemini-3-flash-preview",
    detail: "Primary Gemini model for high-quality fast replies.",
  },
  {
    id: "gemini-2-5-flash",
    name: "Gemini 2.5 Flash",
    model: process.env.GEMINI_MODEL_2 || "gemini-2.5-flash",
    detail: "Fast fallback with strong general reply quality.",
  },
  {
    id: "gemini-3-1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    model: process.env.GEMINI_MODEL_3 || "gemini-3.1-flash-lite-preview",
    detail: "High-volume lightweight Gemini fallback.",
  },
  {
    id: "gemini-2-5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    model: process.env.GEMINI_MODEL_4 || "gemini-2.5-flash-lite",
    detail: "Cost-efficient fallback for simple copy generation.",
  },
  {
    id: "gemma-4-31b",
    name: "Gemma 4 31B",
    model: process.env.GEMINI_MODEL_5 || "gemma-4-31b-it",
    detail: "Larger Gemma fallback for instruction-tuned text generation.",
  },
  {
    id: "gemma-4-26b",
    name: "Gemma 4 26B",
    model: process.env.GEMINI_MODEL_6 || "gemma-4-26b-a4b-it",
    detail: "Mid-size Gemma 4 fallback for text generation.",
  },
  {
    id: "gemma-3-27b",
    name: "Gemma 3 27B",
    model: process.env.GEMINI_MODEL_7 || "gemma-3-27b-it",
    detail: "Gemma 3 fallback with larger open-model capacity.",
  },
  {
    id: "gemma-3-12b",
    name: "Gemma 3 12B",
    model: process.env.GEMINI_MODEL_8 || "gemma-3-12b-it",
    detail: "Final lightweight Gemma fallback for the day.",
  },
];

const AI_MODELS: AiModelConfig[] = [
  {
    id: "dev",
    provider: "google",
    providerName: "Google",
    name: "Dev",
    model: GEMINI_POOL[0].model,
    envKey: "GEMINI_API_KEY",
    visibleInProduction: false,
    bestFor: "For internal testing",
    description:
      "Use the development fallback stack to test prompts, imports, and queue flows without spending production credits.",
    detail: "Gemini stack",
    strengths: ["Development only", "Low-risk testing", "Fallback pool"],
  },
  {
    id: "basic",
    provider: "openai",
    providerName: "OpenAI",
    name: "Basic",
    model: process.env.OPENAI_BASIC_MODEL || "gpt-5.4-nano",
    envKey: "OPENAI_API_KEY",
    bestFor: "Lowest-cost generation",
    description:
      "Best for simple, high-volume reviews when cost and speed matter most. Less reliable with nuanced tone or complex context.",
    detail: "gpt-5.4-nano",
    strengths: ["Lowest cost", "Fast generation", "Simple reviews"],
  },
  {
    id: "pro",
    provider: "openai",
    providerName: "OpenAI",
    name: "Pro",
    model: process.env.OPENAI_PRO_MODEL || "gpt-5.4-mini",
    envKey: "OPENAI_API_KEY",
    bestFor: "Best balance for most shops",
    description:
      "A strong default tier with better tone matching, more reliable instructions, and better handling of mixed reviews.",
    detail: "gpt-5.4-mini",
    strengths: ["Recommended", "Better tone matching", "Reliable instructions"],
  },
  {
    id: "premium",
    provider: "openai",
    providerName: "OpenAI",
    name: "Premium",
    model: process.env.OPENAI_PREMIUM_MODEL || "gpt-5.4",
    envKey: "OPENAI_API_KEY",
    bestFor: "Highest quality output",
    description:
      "Best for complex reviews, subtle sentiment, and more polished brand voice with fewer edits needed.",
    detail: "gpt-5.4",
    strengths: ["Best nuance", "Polished replies", "Strongest context"],
  },
];

const LEGACY_MODEL_IDS: Record<string, string> = {
  "gemini-3-flash-preview": "dev",
  "openai-gpt-5-4-mini": "pro",
};

export class AiProviderError extends Error {
  status?: number;
  provider?: AiProvider;
  model?: string;
  details?: unknown;

  constructor(
    message: string,
    options: { status?: number; provider?: AiProvider; model?: string; details?: unknown } = {},
  ) {
    super(message);
    this.name = "AiProviderError";
    this.status = options.status;
    this.provider = options.provider;
    this.model = options.model;
    this.details = options.details;
  }
}

function apiKeyFor(config: AiModelConfig) {
  return process.env[config.envKey] || "";
}

function visibleAiModels() {
  return AI_MODELS.filter((model) => model.visibleInProduction !== false || !IS_PRODUCTION);
}

export function resolveAiModelId(modelId?: string | null) {
  const candidateId = LEGACY_MODEL_IDS[modelId || ""] || modelId || "";
  const visibleModels = visibleAiModels();
  return visibleModels.some((model) => model.id === candidateId)
    ? candidateId
    : visibleModels[0]?.id ?? AI_MODELS[0].id;
}

function modelForId(modelId?: string | null) {
  const resolvedModelId = resolveAiModelId(modelId);
  return AI_MODELS.find((model) => model.id === resolvedModelId) ?? visibleAiModels()[0] ?? AI_MODELS[0];
}

function dailyGeminiDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: GEMINI_DAILY_RESET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function parseJsonStringList(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => (typeof item === "string" ? item : "")).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function availableGeminiModel(exhaustedModelIds: string[]) {
  const exhausted = new Set(exhaustedModelIds);
  return GEMINI_POOL.find((model) => !exhausted.has(model.id)) ?? null;
}

async function getGeminiPoolSnapshot() {
  const dayKey = dailyGeminiDayKey();
  const state = await db.aiProviderDailyState.findUnique({
    where: { provider_dayKey: { provider: GEMINI_POOL_PROVIDER, dayKey } },
  });
  const exhaustedModelIds = parseJsonStringList(state?.exhaustedModelsJson);
  const activeModel = availableGeminiModel(exhaustedModelIds);

  return {
    dayKey,
    activeModel,
    exhaustedModelIds,
    exhaustedModels: GEMINI_POOL.filter((model) => exhaustedModelIds.includes(model.id)),
    models: GEMINI_POOL,
  };
}

async function markGeminiModelExhausted(model: GeminiPoolModel, details: unknown) {
  const dayKey = dailyGeminiDayKey();
  const currentState = await db.aiProviderDailyState.findUnique({
    where: { provider_dayKey: { provider: GEMINI_POOL_PROVIDER, dayKey } },
  });
  const exhaustedModelIds = uniqueStrings([
    ...parseJsonStringList(currentState?.exhaustedModelsJson),
    model.id,
  ]);
  const nextModel = availableGeminiModel(exhaustedModelIds);
  const lastErrorJson = JSON.stringify({
    modelId: model.id,
    model: model.model,
    at: new Date().toISOString(),
    details,
  }).slice(0, 6000);

  await db.aiProviderDailyState.upsert({
    where: { provider_dayKey: { provider: GEMINI_POOL_PROVIDER, dayKey } },
    update: {
      exhaustedModelsJson: JSON.stringify(exhaustedModelIds),
      currentModelId: nextModel?.id ?? null,
      lastErrorJson,
    },
    create: {
      provider: GEMINI_POOL_PROVIDER,
      dayKey,
      exhaustedModelsJson: JSON.stringify(exhaustedModelIds),
      currentModelId: nextModel?.id ?? null,
      lastErrorJson,
    },
  });

  return nextModel;
}

function runtimeModelFromConfig(config: AiModelConfig): RuntimeModel {
  return {
    id: config.id,
    name: config.name,
    provider: config.providerName,
    model: config.model,
  };
}

function runtimeModelFromGemini(model: GeminiPoolModel): RuntimeModel {
  return {
    id: model.id,
    name: model.name,
    provider: "Google",
    model: model.model,
  };
}

export async function getGeminiPoolStatus() {
  const snapshot = await getGeminiPoolSnapshot();
  return {
    dayKey: snapshot.dayKey,
    activeModel: snapshot.activeModel
      ? runtimeModelFromGemini(snapshot.activeModel)
      : null,
    exhaustedModels: snapshot.exhaustedModels.map(runtimeModelFromGemini),
    models: snapshot.models.map((model) => ({
      ...runtimeModelFromGemini(model),
      detail: model.detail,
      exhaustedToday: snapshot.exhaustedModelIds.includes(model.id),
      activeToday: snapshot.activeModel?.id === model.id,
    })),
  };
}

export async function getAiModelOptions() {
  const visibleModels = visibleAiModels();
  const geminiPoolStatus = await getGeminiPoolStatus();
  return visibleModels.map((model) => ({
    id: model.id,
    provider: model.providerName,
    name: model.name,
    model: model.model,
    detail: model.detail,
    bestFor: model.bestFor,
    description: model.description,
    strengths: model.strengths,
    configured: Boolean(apiKeyFor(model)),
    missingEnv: apiKeyFor(model) ? null : model.envKey,
    activeVariant: model.provider === "google" ? geminiPoolStatus.activeModel : null,
    exhaustedVariants: model.provider === "google" ? geminiPoolStatus.exhaustedModels : [],
    variants: model.provider === "google" ? geminiPoolStatus.models : [],
    dayKey: model.provider === "google" ? geminiPoolStatus.dayKey : null,
    credits: creditCostsForModel(model.id),
  }));
}

export function getDefaultAiModelId() {
  return visibleAiModels()[0]?.id ?? AI_MODELS[0].id;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function aiProviderTimeoutMs() {
  const value = Number(process.env.AI_API_TIMEOUT_MS || DEFAULT_AI_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_AI_PROVIDER_TIMEOUT_MS;
}

function isTimeoutError(error: unknown) {
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function fetchAiProvider(
  url: string,
  init: RequestInit,
  config: AiModelConfig,
  model: string = config.model,
) {
  const timeoutMs = aiProviderTimeoutMs();

  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message = isTimeoutError(error)
      ? `${config.providerName} did not respond within ${Math.round(timeoutMs / 1000)} seconds. Please try again later.`
      : `Could not reach ${config.providerName}. Please try again later.`;

    throw new AiProviderError(message, {
      provider: config.provider,
      model,
      details: {
        timeoutMs,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assertConfigured(config: AiModelConfig) {
  const apiKey = apiKeyFor(config);
  if (!apiKey) {
    throw new AiProviderError(`${config.envKey} is not configured for ${config.name}.`, {
      provider: config.provider,
      model: config.model,
      details: { missingEnv: config.envKey },
    });
  }

  return apiKey;
}

function compactReplies(replies: ImportedReply[]) {
  return replies
    .slice(0, 50)
    .map((reply, index) => {
      const parts = [
        `${index + 1}. ${reply.text}`,
        reply.rating ? `rating: ${reply.rating}` : null,
        reply.product ? `product: ${reply.product}` : null,
        reply.source ? `source: ${reply.source}` : null,
      ].filter(Boolean);

      return parts.join(" | ");
    })
    .join("\n");
}

function personalityStyleInstruction(style?: string) {
  return TONE_PRESET_INSTRUCTIONS[style || ""] ?? TONE_PRESET_INSTRUCTIONS.use_personality;
}

function replyLengthInstruction(length?: string) {
  return REPLY_LENGTH_INSTRUCTIONS[length || ""] ?? REPLY_LENGTH_INSTRUCTIONS.adaptive;
}

function normalizeRating(value?: number | string | null) {
  const rating = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(rating)) return 5;
  return Math.max(1, Math.min(5, Math.round(rating)));
}

function productContextLines(input: {
  productTitle?: string | null;
  productType?: string | null;
  productTags?: string[];
  productDescription?: string | null;
}) {
  const tags = input.productTags?.filter(Boolean).slice(0, 12).join(", ") || "none";
  const description = input.productDescription?.trim();
  return [
    `Primary product source of truth - title/name: ${input.productTitle?.trim() || "Store review"}`,
    `Primary product source of truth - type: ${input.productType?.trim() || "unknown"}`,
    `Primary product source of truth - tags: ${tags}`,
    description
      ? `Primary product source of truth - merchant description. Use only when directly relevant and do not overquote it: ${description}`
      : "Primary product source of truth - merchant description: not included",
  ];
}

function personalityStrengthInstruction(strength?: string) {
  return PERSONALITY_STRENGTH_INSTRUCTIONS[strength || ""] ?? PERSONALITY_STRENGTH_INSTRUCTIONS.balanced;
}

function ensureSignOff(text: string, signOff?: string) {
  const cleanSignOff = signOff?.trim();
  const cleanText = text.trim();
  if (!cleanSignOff || cleanText.endsWith(cleanSignOff)) return cleanText;

  return `${cleanText}\n\n${cleanSignOff}`;
}

function compactWhitespace(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function quotedRuleList(values?: string[]) {
  const rules = values?.map(compactWhitespace).filter(Boolean).slice(0, 24) || [];
  return rules.length ? rules.map((rule) => `"${rule}"`).join("; ") : "none";
}

function customerFirstName(value?: string | null) {
  const parts = compactWhitespace(value).split(" ").filter(Boolean);
  const firstName = parts[0] || "";
  if (!firstName || firstName.toLowerCase() === "customer") return "there";
  return firstName;
}

function replyGreeting(pattern?: string | null, customerName?: string | null) {
  const cleanPattern = compactWhitespace(pattern) || "Hi {name} -";
  const firstName = customerFirstName(customerName);
  if (cleanPattern.includes("{name}")) {
    return cleanPattern.replace(/\{name\}/g, firstName);
  }
  return `${cleanPattern} ${firstName}`.trim();
}

function personalityPrompt(replies: ImportedReply[], context: BrandVoiceContext = {}) {
  return [
    "Generate the Personality field for ReplyPulse AI: Review Replies, a Shopify app that drafts public replies to product reviews.",
    "Use ONLY the imported merchant replies as evidence. Do not invent identity, names, locations, family relationships, product origin, policies, languages, materials, or brand facts.",
    "The imported replies are merchant-written responses, not customer reviews. If a pasted item contains many replies together, separate them mentally by line breaks, numbering, bullets, repeated greetings, or repeated sign-offs before inferring personality.",
    "If accidental customer review text or labels are included, ignore those parts and learn only from the merchant response wording.",
    "If a detail is not clearly present in the replies, leave it out.",
    "Focus on the durable voice and basic rules the assistant should follow: attitude, boundaries, word choice, cadence, specificity, apology style, gratitude style, and how the merchant treats customers.",
    "Do not include drafting controls such as reply length, sentence count, tone preset, voice intensity, format, or how strongly to apply the voice. Those controls are configured separately.",
    "Match the same structure as ReplyPulse AI: Review Replies' built-in presets.",
    "Start exactly with: \"Brand personality: \" followed by 3-6 concise traits inferred from the replies.",
    "Then write three short plain-text paragraphs that start with these exact phrases: \"This voice\", \"Basic rules:\", and \"The goal\".",
    "The content should describe how the brand speaks and behaves in replies, not who owns the business.",
    "Do not write \"you are\", \"I am\", \"the merchant is\", or a biography.",
    "Output plain English text only. No JSON, no Markdown, no bullets.",
    `Write 90-180 words. Never exceed ${PERSONALITY_DESCRIPTION_MAX_WORDS} words or ${PERSONALITY_DESCRIPTION_MAX_CHARS} characters. Finish with a complete sentence.`,
    "",
    `Current Personality draft, only for continuity if useful: ${context.personality || "none"}`,
    `Greeting pattern: ${context.greeting || "none"}`,
    `Sign-off pattern: ${context.signOff || "none"}`,
    "",
    "Imported replies:",
    compactReplies(replies) || "No replies available.",
  ].join("\n");
}

function previewPrompt(context: BrandVoiceContext) {
  const signOff = context.signOff?.trim() || "- The team";
  const previewReview = context.previewReview?.trim() || DEFAULT_PREVIEW_REVIEW;
  const previewRating = normalizeRating(context.previewRating);
  const alwaysMention = quotedRuleList(context.alwaysMention);
  const avoidPhrases = quotedRuleList(context.avoidPhrases);
  const greeting = replyGreeting(context.greeting, "Anya");

  return [
    "You are ReplyPulse AI: Review Replies. Generate one public reply to a product review using the merchant voice below.",
    "Output the reply text only. No JSON, no Markdown, no label.",
    "Write like a thoughtful human merchant, not a review analyst.",
    "Respect the configured tone preset, voice intensity, and length. Do not make the reply shorter than requested.",
    "Product truth hierarchy: product title/name, product type, product tags, and merchant product description are more reliable than the customer's wording.",
    "Treat the customer review as a fallible report. The customer may be mistaken, may describe a different item, or may mix up product details.",
    "If the review appears inconsistent with the product truth, do not endorse the inconsistent claim as fact. Acknowledge the possible mix-up lightly and invite clarification or a closer look.",
    "Do not summarize the review point-by-point, mirror every clause, or sound like a template.",
    "Mention at most two concrete review details, then respond to what matters.",
    "Use the same language as the review when it is clear; otherwise use English.",
    "Never invent numbers, counts, percentages, statistics, policies, people, timelines, materials, guarantees, or product claims.",
    "Emphasis guidance is optional context, not mandatory wording. Use it only when it naturally fits the review and helps the reply.",
    "Avoid-preference phrases are wording to avoid when practical. They are not a reason to make the reply awkward; use judgment.",
    "Avoid robotic analysis phrases like \"balanced review\", \"practical tradeoffs\", \"it is helpful to hear\", or \"details like that matter\".",
    `Tone preset: ${personalityStyleInstruction(context.personalityStyle)}`,
    `Voice intensity: ${personalityStrengthInstruction(context.personalityStrength)}`,
    `Length: ${replyLengthInstruction(context.replyLength).instruction}`,
    `The final line must be this exact sign-off: ${signOff}`,
    `Emphasize when helpful, without forcing these words or inventing supporting details: ${alwaysMention}`,
    `Prefer avoiding these phrases or patterns when a natural alternative exists: ${avoidPhrases}`,
    "",
    `Personality: ${context.personality || "Warm, human, and specific."}`,
    `Greeting to use if greeting the customer: ${greeting}`,
    `Sign-off pattern: ${signOff}`,
    ...productContextLines({
      productTitle: context.previewProductTitle,
      productType: context.previewProductType,
      productTags: context.previewProductTags,
      productDescription: context.previewProductDescription,
    }),
    `Review from Anya, ${previewRating} out of 5 stars: "${previewReview}"`,
    "Before finalizing, check: no unsupported numbers, no invented facts, no duplicated name, no mechanical recap.",
    "Keep the reply natural and ready to send.",
  ].join("\n");
}

function reviewReplyPrompt(context: ReviewReplyContext) {
  const signOff = context.signOff?.trim() || "- The team";
  const rating = normalizeRating(context.rating);
  const alwaysMention = quotedRuleList(context.alwaysMention);
  const avoidPhrases = quotedRuleList(context.avoidPhrases);
  const nudge = context.nudge?.trim();
  const greeting = replyGreeting(context.greeting, context.customerName);
  const firstName = customerFirstName(context.customerName);

  return [
    "You are ReplyPulse AI: Review Replies. Generate one public merchant reply to a product review.",
    "Output the reply text only. No JSON, no Markdown, no label.",
    "Write like a thoughtful human merchant, not a review analyst.",
    "Use the merchant voice and product context. Mention product details only when they help the reply feel specific and true.",
    "Product truth hierarchy: product title/name, product type, product tags, all merchant-provided product data, and the product description are the primary sources of truth.",
    "Treat the customer's review as a fallible report, not guaranteed fact. The customer may be mistaken, may be describing another product, or may be mixing up product details.",
    "If the review conflicts with the product truth, do not validate the conflicting detail as true. Gently signal the possible confusion without sounding accusatory, for example by saying you want to make sure you are looking at the right item or that the detail does not seem to match this product.",
    "When product truth and review wording conflict, stay grounded in the product truth and keep the reply cautious enough for a human to review before sending.",
    "Do not summarize the review point-by-point, mirror every clause, or sound like a template.",
    "Mention at most two concrete review details, then respond to what matters.",
    "Do not invent numbers, counts, percentages, statistics, product materials, policies, shipping facts, guarantees, discounts, people, timelines, or private customer details.",
    "Do not add a number unless that exact number appears in the review, product context, rating, or a concrete Brand Voice rule.",
    "Emphasis guidance is optional context, not mandatory wording. Use it only when it naturally fits the review and helps the reply.",
    "If an emphasis item is vague, test-like, or impossible to ground in the review, ignore it.",
    "Avoid-preference phrases are wording to avoid when practical. They are not a reason to make the reply awkward; use judgment.",
    "Avoid robotic analysis phrases like \"balanced review\", \"practical tradeoffs\", \"real park conditions\", \"it is helpful to hear\", or \"details like that matter\".",
    "Match the response to the star rating: 5 stars can be appreciative, 4 stars should acknowledge the minor gap, 3 stars should be balanced and practical, 1-2 stars should be apologetic and focused on next steps.",
    "For mixed reviews, appreciate the positive detail, plainly acknowledge the concern, and avoid over-explaining or promising fixes you cannot guarantee.",
    `Tone preset: ${personalityStyleInstruction(context.personalityStyle)}`,
    `Voice intensity: ${personalityStrengthInstruction(context.personalityStrength)}`,
    `Length: ${replyLengthInstruction(context.replyLength).instruction}`,
    `The final line must be this exact sign-off: ${signOff}`,
    `Emphasize when helpful, without forcing these words or inventing supporting details: ${alwaysMention}`,
    `Prefer avoiding these phrases or patterns when a natural alternative exists: ${avoidPhrases}`,
    nudge ? `Requested adjustment: ${nudge}` : "Requested adjustment: none",
    "",
    `Personality: ${context.personality || "Warm, human, and specific."}`,
    `Greeting to use if greeting the customer: ${greeting}`,
    `Customer first name only: ${firstName}`,
    ...productContextLines({
      productTitle: context.productTitle,
      productType: context.productType,
      productTags: context.productTags,
      productDescription: context.productDescription,
    }),
    `Rating: ${rating} out of 5 stars`,
    `Review: "${context.reviewBody}"`,
    "Before finalizing, check: no unsupported numbers, no invented facts, no duplicated name, no mechanical recap.",
    "Keep the reply ready to send.",
  ].join("\n");
}

function reviewReplyRevisionPrompt(context: ReviewReplyRevisionContext) {
  const signOff = context.signOff?.trim() || "- The team";
  const rating = normalizeRating(context.rating);
  const alwaysMention = quotedRuleList(context.alwaysMention);
  const avoidPhrases = quotedRuleList(context.avoidPhrases);

  return [
    "You are ReplyPulse AI: Review Replies. Edit an existing public merchant reply to a product review.",
    "Output the revised reply text only. No JSON, no Markdown, no label.",
    "This is a revision task, not a fresh generation task.",
    "Start from the current draft and make the smallest useful change that satisfies the merchant instruction.",
    "Preserve facts, tone, customer context, product context, language, greeting, and sign-off unless the instruction explicitly asks to change them.",
    "Product truth hierarchy: product title/name, product type, product tags, all merchant-provided product data, and the product description are more reliable than the review wording.",
    "Treat the review as fallible. If the current draft validates a product detail that conflicts with product truth, revise it to be cautious and lightly flag the possible mix-up.",
    "Do not add unsupported numbers, facts, policies, guarantees, people, timelines, materials, discounts, or private customer details.",
    "Do not summarize the review again or restart the reply from scratch.",
    "If the instruction asks for an unsafe or unsupported change, apply the closest safe wording while staying grounded in the review.",
    `Merchant instruction, maximum 100 characters: ${context.instruction}`,
    `Tone preset: ${personalityStyleInstruction(context.personalityStyle)}`,
    `Voice intensity: ${personalityStrengthInstruction(context.personalityStrength)}`,
    `Length preference: ${replyLengthInstruction(context.replyLength).instruction}`,
    `The final line must be this exact sign-off: ${signOff}`,
    `Emphasize when helpful, without forcing these words or inventing supporting details: ${alwaysMention}`,
    `Prefer avoiding these phrases or patterns when a natural alternative exists: ${avoidPhrases}`,
    "",
    `Personality: ${context.personality || "Warm, human, and specific."}`,
    ...productContextLines({
      productTitle: context.productTitle,
      productType: context.productType,
      productTags: context.productTags,
      productDescription: context.productDescription,
    }),
    `Rating: ${rating} out of 5 stars`,
    `Review: "${context.reviewBody}"`,
    "",
    "Current draft to revise:",
    context.currentDraft,
    "",
    "Before finalizing, check: this is the edited current draft, not a new draft; no unsupported numbers; no invented facts; sign-off is exact.",
  ].join("\n");
}

function extractJsonObject(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new AiProviderError("AI provider returned a non-JSON response.", {
      details: { responseText: text.slice(0, 2000) },
    });
  }
}

function cleanPlainText(text: string) {
  const trimmed = text
    .trim()
    .replace(/^```(?:text|markdown|md)?/i, "")
    .replace(/```$/i, "")
    .trim();

  if (trimmed.startsWith("{")) {
    try {
      const data = extractJsonObject(trimmed);
      const plainText =
        readText(data.personality) ||
        readText(data.livePreview) ||
        readText(data.reply) ||
        readText(data.text);
      if (plainText) return plainText;
    } catch {
      // Fall back to plain text cleanup below.
    }
  }

  return trimmed
    .replace(/^personality\s*:\s*/i, "")
    .replace(/^["“]|["”]$/g, "")
    .trim();
}

function limitPersonalityDescription(text: string) {
  const clean = compactWhitespace(text);
  const words = clean.split(/\s+/).filter(Boolean);
  let limited = words.length > PERSONALITY_DESCRIPTION_MAX_WORDS
    ? words.slice(0, PERSONALITY_DESCRIPTION_MAX_WORDS).join(" ")
    : clean;

  if (limited.length > PERSONALITY_DESCRIPTION_MAX_CHARS) {
    limited = limited.slice(0, PERSONALITY_DESCRIPTION_MAX_CHARS).trim();
  }

  if (limited.length === clean.length) return limited;

  const sentenceEnd = Math.max(
    limited.lastIndexOf("."),
    limited.lastIndexOf("!"),
    limited.lastIndexOf("?"),
  );
  if (sentenceEnd > Math.floor(PERSONALITY_DESCRIPTION_MAX_CHARS * 0.55)) {
    return limited.slice(0, sentenceEnd + 1).trim();
  }

  return `${limited.replace(/[,:;\s]+$/g, "").trim()}.`;
}

function extractOpenAiText(body: unknown) {
  const response = readObject(body);
  const outputText = readText(response.output_text);
  if (outputText) return outputText;

  const output = Array.isArray(response.output) ? response.output : [];
  return output
    .flatMap((item) => {
      const content = readObject(item).content;
      return Array.isArray(content) ? content : [];
    })
    .map((content) => readText(readObject(content).text))
    .filter(Boolean)
    .join("\n");
}

function extractGeminiText(body: unknown) {
  const candidates = readObject(body).candidates;
  const first = Array.isArray(candidates) ? readObject(candidates[0]) : {};
  const parts = readObject(first.content).parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => {
      const partObject = readObject(part);
      return partObject.thought === true ? "" : readText(partObject.text);
    })
    .filter(Boolean)
    .join("\n");
}

function extractGeminiFinishReason(body: unknown) {
  const candidates = readObject(body).candidates;
  const first = Array.isArray(candidates) ? readObject(candidates[0]) : {};
  return readText(first.finishReason).toUpperCase();
}

function extractGeminiFinishMessage(body: unknown) {
  const candidates = readObject(body).candidates;
  const first = Array.isArray(candidates) ? readObject(candidates[0]) : {};
  return readText(first.finishMessage);
}

function geminiThinkingConfig(model: string) {
  const normalizedModel = model.toLowerCase();
  if (normalizedModel.includes("gemini-3")) {
    return { thinkingLevel: "minimal" };
  }
  if (normalizedModel.includes("gemini-2.5-flash")) {
    return { thinkingBudget: 0 };
  }
  return null;
}

function defaultMaxTokens(responseFormat: "json" | "text") {
  return responseFormat === "json" ? DEFAULT_JSON_MAX_TOKENS : DEFAULT_TEXT_MAX_TOKENS;
}

function isGeminiQuotaExhausted(status: number, body: unknown) {
  const error = readObject(readObject(body).error);
  const errorStatus = readText(error.status).toUpperCase();
  const message = readText(error.message).toLowerCase();

  return (
    status === 429 ||
    errorStatus === "RESOURCE_EXHAUSTED" ||
    message.includes("quota") ||
    message.includes("resource exhausted") ||
    message.includes("rate limit")
  );
}

async function callOpenAi(
  config: AiModelConfig,
  prompt: string,
  options: GenerateTextOptions = {},
): Promise<ProviderTextResult> {
  const apiKey = assertConfigured(config);
  const responseFormat = options.responseFormat ?? "json";
  const text =
    responseFormat === "json"
      ? { format: { type: "json_object" } }
      : { format: { type: "text" }, verbosity: options.textVerbosity ?? "medium" };
  const response = await fetchAiProvider(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        instructions:
          options.system ??
          (responseFormat === "json" ? "Return compact valid JSON only." : "Return plain text only."),
        input: prompt,
        max_output_tokens: options.maxTokens ?? defaultMaxTokens(responseFormat),
        text,
        ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
        store: false,
      }),
    },
    config,
  );
  const body = await readJsonResponse(response);

  if (!response.ok) {
    throw new AiProviderError(`OpenAI request failed with ${response.status}.`, {
      status: response.status,
      provider: config.provider,
      model: config.model,
      details: body,
    });
  }

  return {
    text: extractOpenAiText(body),
    runtimeModel: runtimeModelFromConfig(config),
  };
}

async function callGemini(
  config: AiModelConfig,
  prompt: string,
  options: GenerateTextOptions = {},
): Promise<ProviderTextResult> {
  const apiKey = assertConfigured(config);
  const responseFormat = options.responseFormat ?? "json";
  const attemptedModelIds = new Set<string>();
  const quotaErrors: unknown[] = [];

  while (attemptedModelIds.size < GEMINI_POOL.length) {
    const snapshot = await getGeminiPoolSnapshot();
    const exhaustedModelIds = new Set(snapshot.exhaustedModelIds);
    const model =
      snapshot.models.find((candidate) => {
        return !exhaustedModelIds.has(candidate.id) && !attemptedModelIds.has(candidate.id);
      }) ?? null;

    if (!model) break;
    attemptedModelIds.add(model.id);

    const thinkingConfig = geminiThinkingConfig(model.model);
    let maxOutputTokens = options.maxTokens ?? defaultMaxTokens(responseFormat);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetchAiProvider(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              ...(responseFormat === "json" && !model.model.startsWith("gemma-")
                ? { responseMimeType: "application/json" }
                : {}),
              ...(thinkingConfig ? { thinkingConfig } : {}),
              temperature: options.temperature ?? 0.35,
              maxOutputTokens,
            },
          }),
        },
        config,
        model.model,
      );
      const body = await readJsonResponse(response);

      if (!response.ok) {
        if (isGeminiQuotaExhausted(response.status, body)) {
          quotaErrors.push({
            modelId: model.id,
            model: model.model,
            status: response.status,
            body,
          });
          await markGeminiModelExhausted(model, { status: response.status, body });
          break;
        }

        throw new AiProviderError(`${model.name} request failed with ${response.status}.`, {
          status: response.status,
          provider: config.provider,
          model: model.model,
          details: body,
        });
      }

      const text = extractGeminiText(body);
      const finishReason = extractGeminiFinishReason(body);

      if (finishReason === "MAX_TOKENS" && attempt === 0) {
        maxOutputTokens = Math.min(Math.max(maxOutputTokens * 2, 4096), GEMINI_RETRY_MAX_TOKENS);
        continue;
      }

      if (finishReason === "MAX_TOKENS") {
        throw new AiProviderError(
          `${model.name} reached the output token limit before finishing. Try again or choose a shorter reply length.`,
          {
            provider: config.provider,
            model: model.model,
            details: {
              finishReason,
              finishMessage: extractGeminiFinishMessage(body),
              maxOutputTokens,
              usageMetadata: readObject(body).usageMetadata,
              partialText: text.slice(0, 2000),
            },
          },
        );
      }

      return {
        text,
        runtimeModel: runtimeModelFromGemini(model),
      };
    }
  }

  const snapshot = await getGeminiPoolSnapshot();
  throw new AiProviderError("All Gemini models reached their daily quota for today.", {
    status: 429,
    provider: config.provider,
    model: snapshot.activeModel?.model ?? GEMINI_POOL[0].model,
    details: {
      dayKey: snapshot.dayKey,
      attemptedModelIds: Array.from(attemptedModelIds),
      exhaustedModels: snapshot.exhaustedModels.map(runtimeModelFromGemini),
      quotaErrors,
    },
  });
}

async function generateText(
  modelId: string | null | undefined,
  prompt: string,
  options: GenerateTextOptions = {},
) {
  const config = modelForId(modelId);
  const result =
    config.provider === "openai"
      ? await callOpenAi(config, prompt, options)
      : await callGemini(config, prompt, options);
  const text = result.text;

  if (!text) {
    throw new AiProviderError(`${config.name} returned an empty response.`, {
      provider: config.provider,
      model: config.model,
    });
  }

  return { config, text, runtimeModel: result.runtimeModel ?? runtimeModelFromConfig(config) };
}

export async function generateBrandVoicePersonalityText(input: {
  modelId?: string | null;
  replies: ImportedReply[];
  context?: BrandVoiceContext;
}) {
  const { config, text, runtimeModel } = await generateText(
    input.modelId,
    personalityPrompt(input.replies, input.context),
    {
      responseFormat: "text",
      maxTokens: PERSONALITY_MAX_TOKENS,
      system:
        "Write a preset-style plain-text Personality field from evidence only. Start with Brand personality traits. Never invent merchant identity or facts. Finish complete sentences.",
      temperature: 0.2,
      textVerbosity: "medium",
      reasoningEffort: "low",
    },
  );
  const personality = limitPersonalityDescription(cleanPlainText(text));

  if (!personality) {
    throw new AiProviderError(`${config.name} did not return a Personality.`, {
      provider: config.provider,
      model: config.model,
      details: { rawText: text.slice(0, 2000) },
    });
  }

  return {
    personality,
    model: runtimeModel,
  };
}

export async function generateLivePreview(input: {
  modelId?: string | null;
  context: BrandVoiceContext;
}) {
  const lengthConfig = replyLengthInstruction(input.context.replyLength);
  const { config, text, runtimeModel } = await generateText(input.modelId, previewPrompt(input.context), {
    responseFormat: "text",
    maxTokens: lengthConfig.maxTokens,
    system:
      "Write one natural public product-review reply as plain text only. Sound human, do not invent facts or numbers, use the requested greeting and exact sign-off.",
    temperature: 0.25,
    textVerbosity: input.context.replyLength === "short" ? "low" : "medium",
    reasoningEffort: "low",
  });
  const livePreview = ensureSignOff(cleanPlainText(text), input.context.signOff);

  if (!livePreview) {
    throw new AiProviderError(`${config.name} did not return a Live preview.`, {
      provider: config.provider,
      model: config.model,
      details: { rawText: text.slice(0, 2000) },
    });
  }

  return {
    livePreview,
    model: runtimeModel,
  };
}

export async function generateReviewReplyText(input: {
  modelId?: string | null;
  context: ReviewReplyContext;
}) {
  const lengthConfig = replyLengthInstruction(input.context.replyLength);
  const { config, text, runtimeModel } = await generateText(
    input.modelId,
    reviewReplyPrompt(input.context),
    {
      responseFormat: "text",
      maxTokens: lengthConfig.maxTokens,
      system:
        "Write one natural public product-review reply as plain text only. Treat merchant product context as the source of truth, treat review wording as fallible, never invent facts or numbers, and respect the exact sign-off.",
      temperature: 0.25,
      textVerbosity: input.context.replyLength === "short" ? "low" : "medium",
      reasoningEffort: "low",
    },
  );
  const reply = ensureSignOff(cleanPlainText(text), input.context.signOff);

  if (!reply) {
    throw new AiProviderError(`${config.name} did not return a review reply.`, {
      provider: config.provider,
      model: config.model,
      details: { rawText: text.slice(0, 2000) },
    });
  }

  return {
    reply,
    model: runtimeModel,
  };
}

export async function generateReviewReplyRevisionText(input: {
  modelId?: string | null;
  context: ReviewReplyRevisionContext;
}) {
  const lengthConfig = replyLengthInstruction(input.context.replyLength);
  const { config, text, runtimeModel } = await generateText(
    input.modelId,
    reviewReplyRevisionPrompt(input.context),
    {
      responseFormat: "text",
      maxTokens: Math.max(lengthConfig.maxTokens, 1600),
      system:
        "Edit the provided product-review reply as plain text only. Treat merchant product context as the source of truth, keep the original draft as the base, follow the merchant instruction, and never invent facts or numbers.",
      temperature: 0.2,
      textVerbosity: input.context.replyLength === "short" ? "low" : "medium",
      reasoningEffort: "low",
    },
  );
  const reply = ensureSignOff(cleanPlainText(text), input.context.signOff);

  if (!reply) {
    throw new AiProviderError(`${config.name} did not return a revised review reply.`, {
      provider: config.provider,
      model: config.model,
      details: { rawText: text.slice(0, 2000) },
    });
  }

  return {
    reply,
    model: runtimeModel,
  };
}

export function serializeAiError(error: unknown) {
  if (error instanceof AiProviderError) {
    return {
      message: error.message,
      status: error.status,
      provider: error.provider,
      model: error.model,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      details: error.stack,
    };
  }

  return {
    message: "Unknown AI provider error.",
    details: error,
  };
}
