import db from "./db.server";
import {
  generateReviewReplyRevisionText,
  generateReviewReplyText,
  getAiModelOptions,
  getDefaultAiModelId,
  resolveAiModelId,
} from "./ai.server";
import { callJudgeMeApi, decryptSecret, JudgeMeApiError } from "./judgeme.server";
import {
  cleanupExpiredReviewHistory,
  isSameTimeZoneDay,
  loadAppSettings,
  reviewNeedsHuman,
  type AppSettings,
} from "./settings.server";
import {
  creditCostForReviewReply,
  getCreditOverview,
  productDescriptionCreditMultiplier,
  refundCredits,
  spendCredits,
} from "./credits.server";
import {
  findProductByTitle,
  loadShopifyProductByHandle,
  loadShopifyProductById,
  loadShopifyProductByTitle,
  loadShopifyProducts,
  type ShopifyProductSummary,
} from "./shopify-products.server";

type AdminGraphql = Parameters<typeof loadShopifyProducts>[0];

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readScalarString(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  return "";
}

function firstScalarString(...values: unknown[]) {
  for (const value of values) {
    const result = readScalarString(value);
    if (result) return result;
  }
  return "";
}

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function compactJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function readStringListJson(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function safeJsonParse(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function compactTags(tags?: string[] | null) {
  const cleanTags = tags?.map((tag) => tag.trim()).filter(Boolean).slice(0, 20) ?? [];
  return cleanTags.length ? JSON.stringify(cleanTags) : null;
}

function compactError(error: unknown) {
  try {
    if (error instanceof Error) {
      return JSON.stringify({
        message: error.message,
        name: error.name,
        details: "details" in error ? (error as { details?: unknown }).details : undefined,
      }).slice(0, 8000);
    }

    return JSON.stringify({ message: "Unknown AI generation error.", details: error }).slice(0, 8000);
  } catch {
    if (error instanceof Error) {
      return JSON.stringify({ message: error.message, name: error.name }).slice(0, 8000);
    }
    return JSON.stringify({ message: "Unknown AI generation error." });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown AI generation error.";
}

function judgeMeAlreadyRepliedMessage(error: unknown) {
  const text = [
    error instanceof Error ? error.message : "",
    error instanceof JudgeMeApiError ? JSON.stringify(error.details ?? "") : "",
  ].join(" ").toLowerCase();

  return text.includes("already") && (
    text.includes("taken") ||
    text.includes("reply") ||
    text.includes("replied")
  );
}

function initialsFromName(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "RP";
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ageLabel(date?: Date | null) {
  if (!date) return "new";
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

type ConfidenceInput = {
  reviewBody: string;
  rating: number;
  draft?: string | null;
  productTitle?: string | null;
  productType?: string | null;
  productTags?: string[] | null;
};

type ProductMismatchInput = {
  reviewBody: string;
  productTitle?: string | null;
  productType?: string | null;
  productTags?: string[] | null;
  productDescription?: string | null;
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "been",
  "because",
  "but",
  "con",
  "del",
  "from",
  "have",
  "just",
  "para",
  "that",
  "the",
  "this",
  "una",
  "was",
  "were",
  "when",
  "with",
  "you",
  "your",
]);

const SEVERE_REVIEW_TERMS = [
  "allergic",
  "allergy",
  "chargeback",
  "counterfeit",
  "dangerous",
  "estafa",
  "fake",
  "fraud",
  "fraude",
  "injury",
  "lawsuit",
  "legal",
  "lesion",
  "peligroso",
  "scam",
  "toxic",
  "unsafe",
];

const SERVICE_REVIEW_TERMS = [
  "broken",
  "cancelled",
  "damaged",
  "dañado",
  "defective",
  "delivery",
  "doesn't work",
  "exchange",
  "late",
  "lost",
  "missing",
  "never arrived",
  "no llego",
  "not arrived",
  "refund",
  "reembolso",
  "return",
  "roto",
  "shipping",
  "stopped working",
  "tracking",
  "unusable",
  "wrong item",
];

const NEGATIVE_REVIEW_TERMS = [
  "angry",
  "awful",
  "bad",
  "cheap",
  "decepcionado",
  "disappointed",
  "enojado",
  "hate",
  "horrible",
  "nothing",
  "not worth",
  "peor",
  "poor quality",
  "terrible",
  "unacceptable",
  "upset",
  "worst",
];

const SUPPORTIVE_REPLY_TERMS = [
  "apologies",
  "apologize",
  "ayuda",
  "ayudarte",
  "contact",
  "email",
  "escribenos",
  "help",
  "lamentamos",
  "look into",
  "make this right",
  "revisar",
  "sentimos",
  "sorry",
  "support",
  "understand",
];

const ROBOTIC_REPLY_PATTERNS = [
  "as an ai",
  "balanced review",
  "details like that matter",
  "i cannot",
  "it is helpful to hear",
  "practical tradeoffs",
  "real park conditions",
  "thank you for your feedback",
  "we appreciate you taking the time to point out both",
  "we value your feedback",
];

const RISKY_REPLY_PROMISES = [
  "always",
  "discount",
  "free",
  "guarantee",
  "immediately",
  "never",
  "refund",
  "replace",
  "replacement",
];

const PRODUCT_MISMATCH_REVIEW_TERMS = [
  "different item",
  "different product",
  "not the item",
  "not the product",
  "not what i ordered",
  "not what we ordered",
  "received a different",
  "received the wrong",
  "sent me a different",
  "sent me the wrong",
  "wrong item",
  "wrong product",
  "articulo equivocado",
  "item equivocado",
  "me enviaron otro",
  "no es el producto",
  "no es lo que pedi",
  "pedido equivocado",
  "producto distinto",
  "producto equivocado",
  "recibi otro",
];

const PRODUCT_CATEGORY_TERMS = [
  "backpack",
  "bag",
  "blanket",
  "board",
  "book",
  "bottle",
  "bowl",
  "bracelet",
  "candle",
  "chair",
  "charger",
  "conditioner",
  "cup",
  "curtain",
  "dress",
  "earring",
  "fork",
  "glove",
  "hat",
  "hoodie",
  "jacket",
  "knife",
  "lamp",
  "lotion",
  "mat",
  "mug",
  "napkin",
  "necklace",
  "notebook",
  "oil",
  "pant",
  "perfume",
  "phone",
  "pillow",
  "plate",
  "poster",
  "print",
  "ring",
  "rug",
  "serum",
  "shampoo",
  "shirt",
  "shoe",
  "skirt",
  "snowboard",
  "soap",
  "sock",
  "sofa",
  "spoon",
  "sticker",
  "sweater",
  "sweatshirt",
  "table",
  "towel",
  "toy",
  "wallet",
  "acondicionador",
  "alfombra",
  "almohada",
  "anillo",
  "bolsa",
  "botella",
  "buzo",
  "camisa",
  "cargador",
  "champu",
  "crema",
  "cuaderno",
  "jabon",
  "libro",
  "manta",
  "mesa",
  "pantalon",
  "plato",
  "pulsera",
  "remera",
  "silla",
  "sombrero",
  "sueter",
  "taza",
  "telefono",
  "toalla",
  "vela",
  "vestido",
  "zapatilla",
  "zapato",
];

function normalizeText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function textWords(value?: string | null) {
  return normalizeText(value)
    .split(/[^\p{L}\p{N}']+/u)
    .map((word) => word.trim())
    .filter(Boolean);
}

const NORMALIZED_PRODUCT_CATEGORY_TERMS = new Set(PRODUCT_CATEGORY_TERMS.map((term) => normalizeText(term)));

function wordCount(value?: string | null) {
  return textWords(value).length;
}

function countPhraseMatches(text: string, phrases: string[]) {
  const normalized = normalizeText(text);
  return phrases.filter((phrase) => normalized.includes(normalizeText(phrase))).length;
}

function clampScore(value: number) {
  return Math.max(22, Math.min(98, Math.round(value)));
}

function uniqueNumbers(value?: string | null) {
  return Array.from(new Set((value ?? "").match(/\b\d+(?:[.,]\d+)?\b/g) ?? []));
}

function meaningfulKeywords(...values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => textWords(value))
        .filter((word) => word.length >= 5 && !STOP_WORDS.has(word))
        .slice(0, 60),
    ),
  );
}

function productCategoryMatches(value?: string | null) {
  const matches = new Set<string>();

  for (const word of textWords(value)) {
    const candidates = [
      word,
      word.replace(/s$/u, ""),
      word.replace(/es$/u, ""),
      word.replace(/ies$/u, "y"),
    ];
    const match = candidates.find((candidate) => NORMALIZED_PRODUCT_CATEGORY_TERMS.has(candidate));
    if (match) matches.add(match);
  }

  return matches;
}

function reviewProductContextMismatch(input: ProductMismatchInput) {
  const reviewBody = input.reviewBody || "";
  const reviewText = normalizeText(reviewBody);
  if (!reviewText) return false;

  if (PRODUCT_MISMATCH_REVIEW_TERMS.some((term) => reviewText.includes(normalizeText(term)))) {
    return true;
  }

  const productTruth = [
    input.productTitle,
    input.productType,
    ...(input.productTags ?? []),
    input.productDescription,
  ].filter(Boolean).join(" ");
  const truthCategories = productCategoryMatches(productTruth);
  const reviewCategories = productCategoryMatches(reviewBody);

  if (!truthCategories.size || !reviewCategories.size || wordCount(reviewBody) < 4) return false;

  return !Array.from(reviewCategories).some((category) => truthCategories.has(category));
}

function confidenceWithProductMismatch(confidence: number, settings: AppSettings, productMismatch: boolean) {
  return productMismatch
    ? Math.min(confidence, Math.max(22, settings.humanReviewThreshold - 1))
    : confidence;
}

function keywordOverlap(draft: string, keywords: string[]) {
  const draftWords = new Set(textWords(draft));
  return keywords.filter((keyword) => draftWords.has(keyword)).length;
}

function buildConfidence(input: ConfidenceInput) {
  const reviewBody = input.reviewBody || "";
  const draft = input.draft || "";
  const reviewWords = wordCount(reviewBody);
  const draftWords = wordCount(draft);
  const severeSignals = countPhraseMatches(reviewBody, SEVERE_REVIEW_TERMS);
  const serviceSignals = countPhraseMatches(reviewBody, SERVICE_REVIEW_TERMS);
  const negativeSignals = countPhraseMatches(reviewBody, NEGATIVE_REVIEW_TERMS);
  const totalRiskSignals = severeSignals + serviceSignals + negativeSignals;
  const hasDraft = Boolean(draft.trim());
  let score = 72;

  score += input.rating >= 5 ? 4 : input.rating === 4 ? 2 : input.rating === 3 ? 0 : input.rating === 2 ? -3 : -5;

  if (reviewWords <= 8) {
    score += input.rating >= 4 ? 5 : -2;
  } else if (reviewWords <= 45) {
    score += 4;
  } else if (reviewWords <= 110) {
    score += 0;
  } else if (reviewWords <= 220) {
    score -= 4;
  } else {
    score -= 7;
  }

  score -= severeSignals * 14;
  score -= serviceSignals * 7;
  score -= negativeSignals * 4;
  if (totalRiskSignals >= 3) score -= 5;

  if (!hasDraft) return clampScore(score - 28);

  if (draftWords < 12) {
    score -= 14;
  } else if (draftWords <= 35) {
    score += 5;
  } else if (draftWords <= 95) {
    score += 8;
  } else if (draftWords <= 150) {
    score += 1;
  } else if (draftWords <= 220) {
    score -= 6;
  } else {
    score -= 12;
  }

  if (reviewWords >= 80 && draftWords < 35) score -= 7;
  if (reviewWords <= 25 && draftWords > 110) score -= 7;

  const reviewKeywords = meaningfulKeywords(
    reviewBody,
    input.productTitle,
    input.productType,
    ...(input.productTags ?? []),
  );
  const overlap = keywordOverlap(draft, reviewKeywords);
  if (reviewKeywords.length >= 4) {
    score += Math.min(10, overlap * 3);
    if (overlap === 0) score -= 9;
  }

  const supportiveSignals = countPhraseMatches(draft, SUPPORTIVE_REPLY_TERMS);
  if (totalRiskSignals > 0) {
    score += supportiveSignals ? Math.min(9, supportiveSignals * 3) : -10;
  }
  if (input.rating <= 2 && supportiveSignals === 0) score -= 8;

  const roboticSignals = countPhraseMatches(draft, ROBOTIC_REPLY_PATTERNS);
  score -= roboticSignals * 10;

  const reviewNumbers = new Set([
    ...uniqueNumbers(reviewBody),
    ...uniqueNumbers(input.productTitle),
    ...uniqueNumbers(input.productType),
    ...(input.productTags ?? []).flatMap((tag) => uniqueNumbers(tag)),
    String(input.rating),
  ]);
  const unsupportedNumbers = uniqueNumbers(draft).filter((number) => !reviewNumbers.has(number));
  score -= Math.min(18, unsupportedNumbers.length * 9);

  const riskyPromises = countPhraseMatches(draft, RISKY_REPLY_PROMISES);
  if (riskyPromises && serviceSignals + severeSignals > 0) score -= Math.min(10, riskyPromises * 3);

  return clampScore(score);
}

function productLookupFromReview(rawReview: unknown) {
  const review = readObject(rawReview);
  const product = readObject(review.product);
  const productData = readObject(review.product_data);
  const shopifyProduct = readObject(review.shopify_product);

  return {
    externalId: firstScalarString(
      review.product_external_id,
      review.product_id,
      review.shopify_product_id,
      product.external_id,
      product.product_external_id,
      product.shopify_product_id,
      product.id,
      productData.external_id,
      productData.product_external_id,
      productData.shopify_product_id,
      productData.id,
      shopifyProduct.id,
      shopifyProduct.admin_graphql_api_id,
    ),
    handle: firstScalarString(
      review.product_handle,
      product.handle,
      product.product_handle,
      productData.handle,
      productData.product_handle,
      shopifyProduct.handle,
    ),
    title: firstScalarString(
      review.product_title,
      product.title,
      product.name,
      productData.title,
      productData.name,
      shopifyProduct.title,
    ),
  };
}

function reviewFields(rawReview: unknown) {
  const review = readObject(rawReview);
  const reviewer = readObject(review.reviewer);
  const productLookup = productLookupFromReview(rawReview);
  const id = String(review.id ?? "");
  const customer =
    readString(reviewer.name) ||
    readString(review.name) ||
    readString(review.reviewer_name) ||
    readString(reviewer.email) ||
    "Customer";
  const body = readString(review.body) || readString(review.title) || "No review body provided.";
  const rating = Math.round(readNumber(review.rating, 0));
  const createdAt = readString(review.created_at) ? new Date(readString(review.created_at)) : new Date();

  return {
    id,
    customer,
    initials: initialsFromName(customer),
    productTitle: productLookup.title || "Store review",
    productExternalId: productLookup.externalId,
    productHandle: productLookup.handle,
    reviewBody: body,
    rating,
    sourceCreatedAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
  };
}

type JudgeMeSourceReply = {
  present: boolean;
  content: string;
  createdAt: string | null;
  author: string;
  visibility: string;
  contentAvailable: boolean;
  message?: string;
};

function readReplyContent(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const object = readObject(value);
  const direct =
    readString(object.content) ||
    readString(object.body) ||
    readString(object.text) ||
    readString(object.message) ||
    readString(object.comment);

  if (direct) return direct.trim();

  if (object.reply && object.reply !== value) return readReplyContent(object.reply);
  if (object.public_reply && object.public_reply !== value) return readReplyContent(object.public_reply);
  if (object.response && object.response !== value) return readReplyContent(object.response);

  return "";
}

function readReplyDate(value: unknown): string | null {
  const object = readObject(value);
  const date =
    readString(object.created_at) ||
    readString(object.updated_at) ||
    readString(object.replied_at) ||
    readString(object.reply_date) ||
    readString(object.date);

  return date || null;
}

function readReplyAuthor(value: unknown): string {
  const object = readObject(value);
  const author = readObject(object.author);
  return (
    readString(object.author_name) ||
    readString(object.name) ||
    readString(author.name) ||
    readString(author.email) ||
    "Judge.me"
  );
}

function sourceReplyFromCandidate(value: unknown, visibility: string): JudgeMeSourceReply | null {
  if (value === undefined || value === null || value === false) return null;

  const content = readReplyContent(value);
  if (!content && typeof value !== "object") return null;
  if (!content && !readReplyDate(value) && !hasReplyMetadata(readObject(value))) return null;

  return {
    present: true,
    content,
    createdAt: readReplyDate(value),
    author: readReplyAuthor(value),
    visibility,
    contentAvailable: Boolean(content),
  };
}

function hasReplyMetadata(review: Record<string, unknown>) {
  const booleanFields = [
    review.has_reply,
    review.has_replies,
    review.has_public_reply,
    review.replied,
    review.replied_by_shop,
    review.with_replies,
  ];
  if (booleanFields.some((value) => value === true || value === "true")) return true;

  const countFields = [
    review.replies_count,
    review.reply_count,
    review.public_replies_count,
    review.comments_count,
  ];
  if (countFields.some((value) => readNumber(value, 0) > 0)) return true;

  return Boolean(readString(review.reply_date) || readString(review.replied_at));
}

function htmlDecode(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function textFromHtml(value: string) {
  return htmlDecode(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

function widgetHtmlFromResponse(response: unknown) {
  if (typeof response === "string") return response;
  const data = readObject(response);
  const candidates = [
    data.widget,
    data.html,
    data.body,
    data.review_widget,
    data.product_review,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }

  return "";
}

function extractReplyTextFromWidgetReviewBlock(block: string) {
  const specificMatch =
    block.match(/<[^>]+class=["'][^"']*jdgm-rev__reply-content[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i) ||
    block.match(/<[^>]+class=["'][^"']*jdgm-rev__reply[^"']*["'][^>]*>([\s\S]*?)(?:<[^>]+class=["'][^"']*jdgm-rev__actions|<\/article>|$)/i) ||
    block.match(/<[^>]+class=["'][^"']*(?:reply|response)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  const content = specificMatch ? textFromHtml(specificMatch[1] ?? "") : "";
  return content
    .replace(/^.*?\breplied\s*:?\s*/i, "")
    .trim();
}

function extractWidgetReplies(response: unknown) {
  const html = widgetHtmlFromResponse(response);
  const replies = new Map<string, JudgeMeSourceReply>();
  if (!html) return replies;

  const reviewMatches = [...html.matchAll(/data-review-id=["']([^"']+)["']/gi)];
  for (let index = 0; index < reviewMatches.length; index += 1) {
    const match = reviewMatches[index];
    const reviewId = match?.[1];
    if (!reviewId || match.index === undefined) continue;

    const nextMatch = reviewMatches[index + 1];
    const block = html.slice(match.index, nextMatch?.index ?? html.length);
    const content = extractReplyTextFromWidgetReviewBlock(block);
    if (!content) continue;

    replies.set(reviewId, {
      present: true,
      content,
      createdAt: null,
      author: "Judge.me",
      visibility: "public",
      contentAvailable: true,
    });
  }

  return replies;
}

function readCachedReply(rawReview: Record<string, unknown>): JudgeMeSourceReply | null {
  const cache = readObject(rawReview.__replyPilot);
  const sourceReply = readObject(cache.sourceReply);
  const content = readReplyContent(sourceReply);

  if (sourceReply.present === true || sourceReply.present === "true") {
    return {
      present: true,
      content,
      createdAt: readReplyDate(sourceReply),
      author: readReplyAuthor(sourceReply),
      visibility: readString(sourceReply.visibility) || "public",
      contentAvailable: Boolean(content),
      message: readString(sourceReply.message) || undefined,
    };
  }

  const reply = sourceReplyFromCandidate(cache.sourceReply, "public");
  return reply?.present ? reply : null;
}

function mergeCachedReply(rawReview: unknown, reply: JudgeMeSourceReply) {
  const review = readObject(rawReview);
  return {
    ...review,
    __replyPilot: {
      ...readObject(review.__replyPilot),
      sourceReply: reply,
      sourceReplySyncedAt: new Date().toISOString(),
    },
  };
}

function markRawReviewAsAlreadyReplied(rawReview: unknown, message: string) {
  return mergeCachedReply(rawReview, {
    present: true,
    content: "",
    createdAt: null,
    author: "Judge.me",
    visibility: "public",
    contentAvailable: false,
    message,
  });
}

function extractJudgeMeSourceReply(rawReview: unknown): JudgeMeSourceReply | null {
  const review = readObject(rawReview);
  const cachedReply = readCachedReply(review);
  if (cachedReply) return cachedReply;

  const directCandidates: Array<[unknown, string]> = [
    [review.reply, "public"],
    [review.public_reply, "public"],
    [review.shop_reply, "public"],
    [review.merchant_reply, "public"],
    [review.store_reply, "public"],
    [review.response, "public"],
    [review.answer, "public"],
  ];

  const arrayCandidates: Array<[unknown, string]> = [
    [review.replies, "public"],
    [review.public_replies, "public"],
    [review.comments, "public"],
    [review.answers, "public"],
  ];

  const foundReplies = [
    ...directCandidates
      .map(([value, visibility]) => sourceReplyFromCandidate(value, visibility))
      .filter((reply): reply is JudgeMeSourceReply => Boolean(reply)),
    ...arrayCandidates.flatMap(([value, visibility]) => (
      Array.isArray(value)
        ? value
            .map((item) => sourceReplyFromCandidate(item, visibility))
            .filter((reply): reply is JudgeMeSourceReply => Boolean(reply))
        : []
    )),
  ];

  const withContent = foundReplies.filter((reply) => reply.contentAvailable);
  const sortedReplies = (withContent.length ? withContent : foundReplies).sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
  if (sortedReplies[0]) return sortedReplies[0];

  if (hasReplyMetadata(review)) {
    return {
      present: true,
      content: "",
      createdAt: readReplyDate(review),
      author: "Judge.me",
      visibility: "public",
      contentAvailable: false,
    };
  }

  return null;
}

async function getConnectedJudgeMeCredentials(shop: string) {
  const connection = await db.judgeMeConnection.findUnique({ where: { shop } });
  if (!connection || connection.status !== "connected") return null;

  return {
    shopDomain: connection.shopDomain,
    apiToken: decryptSecret(connection.encryptedApiToken),
  };
}

type ImportedJudgeMeReview = {
  rawReview: unknown;
  fields: ReturnType<typeof reviewFields>;
};

async function loadWidgetRepliesForImportedReviews(
  reviews: ImportedJudgeMeReview[],
  credentials: { apiToken: string; shopDomain: string },
) {
  const replies = new Map<string, JudgeMeSourceReply>();
  const grouped = new Map<string, ImportedJudgeMeReview[]>();

  for (const review of reviews) {
    const key = review.fields.productExternalId
      ? `external_id:${review.fields.productExternalId}`
      : review.fields.productHandle
        ? `handle:${review.fields.productHandle}`
        : "";
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), review]);
  }

  for (const [key, group] of grouped) {
    const [kind, value] = key.split(":");
    const missingIds = new Set(group.map((review) => review.fields.id).filter(Boolean));
    const maxPages = Math.min(12, Math.max(2, Math.ceil(missingIds.size / 5) + 3));

    for (let page = 1; page <= maxPages && missingIds.size; page += 1) {
      const response = await callJudgeMeApi("/widgets/product_review", {
        apiToken: credentials.apiToken,
        shopDomain: credentials.shopDomain,
        searchParams: {
          page,
          per_page: 5,
          ...(kind === "external_id" ? { external_id: value } : { handle: value }),
        },
      });

      const widgetReplies = extractWidgetReplies(response);
      for (const [reviewId, reply] of widgetReplies) {
        replies.set(reviewId, reply);
        missingIds.delete(reviewId);
      }
    }
  }

  return replies;
}

export async function syncJudgeMeReviews(shop: string, admin?: AdminGraphql) {
  const credentials = await getConnectedJudgeMeCredentials(shop);
  if (!credentials) return { connected: false, imported: 0 };
  const products = await loadShopifyProducts(admin).catch(() => [] as ShopifyProductSummary[]);

  const response = await callJudgeMeApi("/reviews", {
    apiToken: credentials.apiToken,
    shopDomain: credentials.shopDomain,
    searchParams: { per_page: 50, page: 1 },
  });
  const reviews = Array.isArray(readObject(response).reviews)
    ? (readObject(response).reviews as unknown[])
    : [];
  const importedReviews = reviews
    .map((rawReview) => ({ rawReview, fields: reviewFields(rawReview) }))
    .filter((review) => Boolean(review.fields.id));
  const widgetReplies = await loadWidgetRepliesForImportedReviews(importedReviews, credentials).catch(() => (
    new Map<string, JudgeMeSourceReply>()
  ));
  let imported = 0;

  for (const importedReview of importedReviews) {
    const { fields } = importedReview;
    if (!fields.id) continue;
    const rawReview = widgetReplies.has(fields.id)
      ? mergeCachedReply(importedReview.rawReview, widgetReplies.get(fields.id) as JudgeMeSourceReply)
      : importedReview.rawReview;
    const externalReply = extractJudgeMeSourceReply(rawReview);
    const product = findProductByTitle(products, fields.productTitle);
    const productType = product?.productType || null;
    const productTagsJson = compactTags(product?.tags);
    const externalReplyData = externalReply?.present
      ? {
          draft: "",
          confidence: 0,
          aiModelId: null,
          aiModelName: null,
          aiProviderName: null,
          aiProviderModel: null,
          draftGeneratedAt: null,
          draftEditedAt: null,
          draftRevisionCount: 0,
          humanRequired: false,
          lastError: null,
        }
      : {};

    const existing = await db.reviewDraft.findUnique({
      where: {
        shop_source_sourceReviewId: {
          shop,
          source: "judgeme",
          sourceReviewId: fields.id,
        },
      },
    });

    if (existing) {
      await db.reviewDraft.update({
        where: { id: existing.id },
        data: {
          customerName: fields.customer,
          customerInitials: fields.initials,
          productTitle: fields.productTitle,
          productType,
          productTagsJson,
          reviewBody: fields.reviewBody,
          rating: fields.rating,
          sourceCreatedAt: fields.sourceCreatedAt,
          sourceReviewJson: compactJson(rawReview),
          lastSyncedAt: new Date(),
          ...externalReplyData,
        },
      });
    } else {
      await db.reviewDraft.create({
        data: {
          shop,
          source: "judgeme",
          sourceReviewId: fields.id,
          customerName: fields.customer,
          customerInitials: fields.initials,
          productTitle: fields.productTitle,
          productType,
          productTagsJson,
          reviewBody: fields.reviewBody,
          rating: fields.rating,
          sourceCreatedAt: fields.sourceCreatedAt,
          sourceReviewJson: compactJson(rawReview),
          draft: "",
          confidence: 0,
          humanRequired: false,
          status: "pending",
          lastSyncedAt: new Date(),
        },
      });
      imported += 1;
    }
  }

  return { connected: true, imported };
}

function mapDraft(record: Awaited<ReturnType<typeof db.reviewDraft.findMany>>[number]) {
  const sourceReview = safeJsonParse(record.sourceReviewJson);
  const judgeMeReply = extractJudgeMeSourceReply(sourceReview);

  return {
    id: record.id,
    source: record.source,
    sourceReviewId: record.sourceReviewId,
    initials: record.customerInitials || initialsFromName(record.customerName || "Customer"),
    customer: record.customerName || "Customer",
    product: record.productTitle || "Store review",
    productType: record.productType || "",
    productTags: readStringListJson(record.productTagsJson),
    review: record.reviewBody,
    rating: record.rating || 0,
    confidence: record.confidence,
    age: ageLabel(record.sourceCreatedAt),
    createdAt: record.sourceCreatedAt?.toISOString() ?? null,
    human: record.humanRequired,
    draft: record.draft,
    draftGenerated: Boolean(record.draft.trim()),
    draftGeneratedAt: record.draftGeneratedAt?.toISOString() ?? null,
    aiModel: record.aiModelId
      ? {
          id: record.aiModelId,
          name: record.aiModelName || record.aiModelId,
          provider: record.aiProviderName || "",
          model: record.aiProviderModel || "",
        }
      : null,
    judgeMeReply,
    hasJudgeMeReply: Boolean(judgeMeReply?.present),
    lastError: record.lastError || "",
    status: record.status,
  };
}

async function loadQueueAiConfig(shop: string, appSettings: AppSettings) {
  const settings = await db.brandVoiceSetting.findUnique({
    where: { shop },
    select: { selectedModel: true },
  });
  const selectedModelId = resolveAiModelId(settings?.selectedModel || getDefaultAiModelId());
  const aiModels = await getAiModelOptions();
  const selectedModel = aiModels.find((model) => model.id === selectedModelId) ?? aiModels[0] ?? null;
  const activeVariant = selectedModel?.activeVariant ?? null;
  const dailyLimitReached = selectedModel?.provider === "Google" && !activeVariant;
  const productDescriptionMultiplier = productDescriptionCreditMultiplier(appSettings.useProductDescription);
  const replyCreditCost = creditCostForReviewReply(selectedModelId, {
    useProductDescription: appSettings.useProductDescription,
  });

  return {
    selectedModelId,
    selectedModel,
    activeVariant,
    configured: Boolean(selectedModel?.configured) && !dailyLimitReached,
    missingEnv: selectedModel?.missingEnv ?? null,
    dailyLimitReached,
    dayKey: selectedModel?.dayKey ?? null,
    displayName: activeVariant?.name || selectedModel?.name || "AI model",
    provider: selectedModel?.provider || activeVariant?.provider || "",
    replyCreditCost,
    productDescriptionMultiplier,
    useProductDescription: appSettings.useProductDescription,
  };
}

export async function getQueueData(shop: string, settings?: AppSettings) {
  const appSettings = settings ?? (await loadAppSettings(shop));
  const reviewRecords = await db.reviewDraft.findMany({
    where: { shop, status: { in: ["pending", "skipped", "sent"] } },
    orderBy: [{ sourceCreatedAt: "desc" }, { createdAt: "desc" }],
  });
  const reviews = reviewRecords.map(mapDraft);
  const pendingReviews = reviews.filter((review) => review.status === "pending");
  const generatedPendingReviews = pendingReviews.filter((review) => review.draftGenerated);
  const judgeMeRepliedReviews = pendingReviews.filter((review) => review.hasJudgeMeReply);
  const products = Array.from(new Set(reviews.map((review) => review.product))).sort();

  return {
    reviews,
    products,
    settings: appSettings,
    stats: {
      pending: reviewRecords.filter((record) => record.status === "pending").length,
      sentToday: reviewRecords.filter((record) =>
        record.status === "sent" && isSameTimeZoneDay(record.sentAt, new Date(), appSettings.timezone),
      ).length,
      sent: reviewRecords.filter((record) => record.status === "sent").length,
      skipped: reviewRecords.filter((record) => record.status === "skipped").length,
      judgeMeReplied: judgeMeRepliedReviews.length,
      ungenerated: pendingReviews.filter((review) => !review.draftGenerated && !review.hasJudgeMeReply).length,
      highConfidence: generatedPendingReviews.filter((review) =>
        review.confidence >= appSettings.highConfidenceThreshold,
      ).length,
      needsHuman: generatedPendingReviews.filter((review) => review.human).length,
    },
  };
}

export async function loadReviewsPageData(
  shop: string,
  options: { sync?: boolean; admin?: AdminGraphql } = {},
) {
  const appSettings = await loadAppSettings(shop);
  await cleanupExpiredReviewHistory(shop, appSettings);
  let connection = await db.judgeMeConnection.findUnique({ where: { shop } });
  let syncResult: Awaited<ReturnType<typeof syncJudgeMeReviews>> | null = null;
  let syncError: unknown = null;

  if (options.sync && connection?.status === "connected") {
    try {
      syncResult = await syncJudgeMeReviews(shop, options.admin);
    } catch (error) {
      syncError = error;
    }
    connection = await db.judgeMeConnection.findUnique({ where: { shop } });
  }

  return {
    connected: Boolean(connection && connection.status === "connected"),
    connectionStatus: connection?.status ?? "not_connected",
    aiConfig: await loadQueueAiConfig(shop, appSettings),
    credits: await getCreditOverview(shop),
    syncResult,
    syncError:
      syncError instanceof Error
        ? {
            message: syncError.message,
            details: syncError instanceof JudgeMeApiError ? syncError.details : undefined,
          }
        : null,
    ...(await getQueueData(shop, appSettings)),
  };
}

async function loadBrandVoiceForDrafts(shop: string) {
  const settings = await db.brandVoiceSetting.findUnique({ where: { shop } });
  return {
    personality: settings?.personality || "",
    greeting: settings?.greeting || "Hi {name} -",
    signOff: settings?.signOff || "- The team",
    alwaysMention: readStringListJson(settings?.alwaysMentionJson),
    avoidPhrases: readStringListJson(settings?.avoidPhrasesJson),
    selectedModel: resolveAiModelId(settings?.selectedModel || getDefaultAiModelId()),
    personalityStyle: settings?.personalityStyle || "use_personality",
    personalityStrength: settings?.personalityStrength || "balanced",
    replyLength: settings?.replyLength || "adaptive",
  };
}

function sourceProductLookup(record: Awaited<ReturnType<typeof db.reviewDraft.findMany>>[number]) {
  const lookup = productLookupFromReview(safeJsonParse(record.sourceReviewJson));
  return {
    externalId: lookup.externalId,
    handle: lookup.handle,
    title: lookup.title || record.productTitle || "",
  };
}

function shopifyProductGid(value: string) {
  const cleanValue = value.trim();
  if (!cleanValue) return "";
  if (cleanValue.startsWith("gid://shopify/Product/")) return cleanValue;
  if (/^\d+$/.test(cleanValue)) return `gid://shopify/Product/${cleanValue}`;
  return "";
}

type ProductDetailCache = Map<string, Promise<ShopifyProductSummary | null>>;

function productCacheKey(kind: string, value: string) {
  const cleanValue = value.trim().toLowerCase();
  return cleanValue ? `${kind}:${cleanValue}` : "";
}

function cachedProductLookup(
  cache: ProductDetailCache | undefined,
  key: string,
  loader: () => Promise<ShopifyProductSummary | null>,
) {
  if (!cache || !key) return loader();
  const existing = cache.get(key);
  if (existing) return existing;

  const result = loader();
  cache.set(key, result);
  return result;
}

async function loadDetailedProductForRecord(
  record: Awaited<ReturnType<typeof db.reviewDraft.findMany>>[number],
  products: ShopifyProductSummary[],
  admin?: AdminGraphql,
  cache?: ProductDetailCache,
) {
  if (!admin) return null;

  const lookup = sourceProductLookup(record);
  const externalGid = shopifyProductGid(lookup.externalId);
  if (externalGid) {
    const product = await cachedProductLookup(
      cache,
      productCacheKey("id", externalGid),
      () => loadShopifyProductById(admin, externalGid).catch(() => null),
    );
    if (product) return product;
  }

  if (lookup.handle) {
    const product = await cachedProductLookup(
      cache,
      productCacheKey("handle", lookup.handle),
      () => loadShopifyProductByHandle(admin, lookup.handle).catch(() => null),
    );
    if (product) return product;
  }

  if (lookup.title) {
    const product = await cachedProductLookup(
      cache,
      productCacheKey("title", lookup.title),
      () => loadShopifyProductByTitle(admin, lookup.title).catch(() => null),
    );
    if (product) return product;
  }

  const matchedProduct = findProductByTitle(products, record.productTitle);
  if (matchedProduct?.id) {
    const product = await cachedProductLookup(
      cache,
      productCacheKey("id", matchedProduct.id),
      () => loadShopifyProductById(admin, matchedProduct.id).catch(() => null),
    );
    if (product) return product;
  }

  return null;
}

async function productContextForRecord(
  record: Awaited<ReturnType<typeof db.reviewDraft.findMany>>[number],
  products: ShopifyProductSummary[],
  options: { admin?: AdminGraphql; useProductDescription?: boolean; productCache?: ProductDetailCache } = {},
) {
  const matchedProduct = findProductByTitle(products, record.productTitle);
  const detailedProduct = await loadDetailedProductForRecord(
    record,
    products,
    options.admin,
    options.productCache,
  );
  const product = detailedProduct ?? matchedProduct;
  const storedTags = readStringListJson(record.productTagsJson);
  const productTags = product?.tags.length ? product.tags : storedTags;

  return {
    productTitle: product?.title || record.productTitle || "Store review",
    productType: product?.productType || record.productType || "",
    productTags,
    productDescription: options.useProductDescription ? product?.description || "" : "",
    matchedProduct: product,
  };
}

async function generateReplyForRecord(
  record: Awaited<ReturnType<typeof db.reviewDraft.findMany>>[number],
  products: ShopifyProductSummary[],
  brandVoice: Awaited<ReturnType<typeof loadBrandVoiceForDrafts>>,
  appSettings: AppSettings,
  admin?: AdminGraphql,
  productCache?: ProductDetailCache,
  nudge?: string,
) {
  const productContext = await productContextForRecord(record, products, {
    admin,
    useProductDescription: appSettings.useProductDescription,
    productCache,
  });
  const result = await generateReviewReplyText({
    modelId: brandVoice.selectedModel,
    context: {
      personality: brandVoice.personality,
      greeting: brandVoice.greeting,
      signOff: brandVoice.signOff,
      alwaysMention: brandVoice.alwaysMention,
      avoidPhrases: brandVoice.avoidPhrases,
      personalityStyle: brandVoice.personalityStyle,
      personalityStrength: brandVoice.personalityStrength,
      replyLength: brandVoice.replyLength,
      customerName: record.customerName,
      reviewBody: record.reviewBody,
      rating: record.rating,
      productTitle: productContext.productTitle,
      productType: productContext.productType,
      productTags: productContext.productTags,
      productDescription: productContext.productDescription,
      nudge,
    },
  });
  const productMismatch = reviewProductContextMismatch({
    reviewBody: record.reviewBody,
    productTitle: productContext.productTitle,
    productType: productContext.productType,
    productTags: productContext.productTags,
    productDescription: productContext.productDescription,
  });

  return {
    draft: result.reply,
    productTitle: productContext.productTitle,
    productType: productContext.productType || null,
    productTags: productContext.productTags,
    productTagsJson: compactTags(productContext.productTags),
    productMismatch,
    aiModelId: result.model.id,
    aiModelName: result.model.name,
    aiProviderName: result.model.provider,
    aiProviderModel: result.model.model,
  };
}

type DraftGenerationResult = {
  requested: number;
  generated: number;
  generatedIds: string[];
  failed: number;
  credits: {
    costPerDraft: number;
    requested: number;
    spent: number;
    refunded: number;
  };
  errors: Array<{ id: string; reviewId: string; customer: string | null; message: string; details: string }>;
};

export async function generateDrafts(shop: string, ids: string[], admin?: AdminGraphql) {
  const records = (await db.reviewDraft.findMany({
    where: { shop, id: { in: ids }, status: "pending", draft: "" },
  })).filter((record) => !extractJudgeMeSourceReply(safeJsonParse(record.sourceReviewJson))?.present);
  const [products, brandVoice, appSettings] = await Promise.all([
    loadShopifyProducts(admin).catch(() => [] as ShopifyProductSummary[]),
    loadBrandVoiceForDrafts(shop),
    loadAppSettings(shop),
  ]);
  const productCache: ProductDetailCache = new Map();
  const result: DraftGenerationResult = {
    requested: records.length,
    generated: 0,
    generatedIds: [],
    failed: 0,
    credits: {
      costPerDraft: creditCostForReviewReply(brandVoice.selectedModel, {
        useProductDescription: appSettings.useProductDescription,
      }),
      requested: 0,
      spent: 0,
      refunded: 0,
    },
    errors: [],
  };
  result.credits.requested = result.credits.costPerDraft * records.length;
  const charge = await spendCredits(shop, result.credits.requested, {
    description: `Generate ${records.length} review ${records.length === 1 ? "reply" : "replies"}`,
    referenceType: "queue_generate",
    referenceId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    metadata: {
      modelId: brandVoice.selectedModel,
      count: records.length,
      useProductDescription: appSettings.useProductDescription,
    },
  });

  for (const record of records) {
    try {
      const generated = await generateReplyForRecord(record, products, brandVoice, appSettings, admin, productCache);
      const draftConfidence = buildConfidence({
        reviewBody: record.reviewBody,
        rating: record.rating ?? 0,
        draft: generated.draft,
        productTitle: generated.productTitle,
        productType: generated.productType,
        productTags: generated.productTags,
      });
      const confidence = confidenceWithProductMismatch(draftConfidence, appSettings, generated.productMismatch);

      await db.reviewDraft.update({
        where: { id: record.id },
        data: {
          draft: generated.draft,
          productType: generated.productType,
          productTagsJson: generated.productTagsJson,
          aiModelId: generated.aiModelId,
          aiModelName: generated.aiModelName,
          aiProviderName: generated.aiProviderName,
          aiProviderModel: generated.aiProviderModel,
          draftGeneratedAt: new Date(),
          draftEditedAt: null,
          draftRevisionCount: 0,
          confidence,
          humanRequired: reviewNeedsHuman({
            reviewBody: record.reviewBody,
            rating: record.rating ?? 0,
            confidence,
            settings: appSettings,
            productMismatch: generated.productMismatch,
          }),
          lastError: null,
        },
      });
      result.generated += 1;
      result.generatedIds.push(record.id);
    } catch (error) {
      const details = compactError(error);
      result.failed += 1;
      result.errors.push({
        id: record.id,
        reviewId: record.sourceReviewId,
        customer: record.customerName,
        message: errorMessage(error),
        details,
      });
      await db.reviewDraft.update({
        where: { id: record.id },
        data: { lastError: details },
      });
    }
  }

  result.credits.refunded = result.failed * result.credits.costPerDraft;
  result.credits.spent = Math.max(0, charge.amount - result.credits.refunded);
  if (result.credits.refunded) {
    await refundCredits(shop, result.credits.refunded, {
      description: `Refund ${result.failed} failed review ${result.failed === 1 ? "reply" : "replies"}`,
      referenceType: "queue_generate_refund",
      referenceId: charge.id ?? undefined,
      metadata: { modelId: brandVoice.selectedModel, failed: result.failed },
    });
  }

  return result;
}

export async function regenerateDrafts(shop: string, ids: string[], nudge?: string, admin?: AdminGraphql) {
  const records = (await db.reviewDraft.findMany({
    where: { shop, id: { in: ids }, status: "pending", draft: { not: "" } },
  })).filter((record) => !extractJudgeMeSourceReply(safeJsonParse(record.sourceReviewJson))?.present);
  const [products, brandVoice, appSettings] = await Promise.all([
    loadShopifyProducts(admin).catch(() => [] as ShopifyProductSummary[]),
    loadBrandVoiceForDrafts(shop),
    loadAppSettings(shop),
  ]);
  const productCache: ProductDetailCache = new Map();
  const result: DraftGenerationResult = {
    requested: records.length,
    generated: 0,
    generatedIds: [],
    failed: 0,
    credits: {
      costPerDraft: creditCostForReviewReply(brandVoice.selectedModel, {
        useProductDescription: appSettings.useProductDescription,
      }),
      requested: 0,
      spent: 0,
      refunded: 0,
    },
    errors: [],
  };
  result.credits.requested = result.credits.costPerDraft * records.length;
  const charge = await spendCredits(shop, result.credits.requested, {
    description: `Regenerate ${records.length} review ${records.length === 1 ? "reply" : "replies"}`,
    referenceType: "queue_regenerate",
    referenceId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    metadata: {
      modelId: brandVoice.selectedModel,
      count: records.length,
      useProductDescription: appSettings.useProductDescription,
    },
  });

  for (const record of records) {
    try {
      const generated = await generateReplyForRecord(record, products, brandVoice, appSettings, admin, productCache, nudge);
      const draftConfidence = buildConfidence({
        reviewBody: record.reviewBody,
        rating: record.rating ?? 0,
        draft: generated.draft,
        productTitle: generated.productTitle,
        productType: generated.productType,
        productTags: generated.productTags,
      });
      const confidence = confidenceWithProductMismatch(draftConfidence, appSettings, generated.productMismatch);

      await db.reviewDraft.update({
        where: { id: record.id },
        data: {
          draft: generated.draft,
          productType: generated.productType,
          productTagsJson: generated.productTagsJson,
          aiModelId: generated.aiModelId,
          aiModelName: generated.aiModelName,
          aiProviderName: generated.aiProviderName,
          aiProviderModel: generated.aiProviderModel,
          draftGeneratedAt: new Date(),
          draftEditedAt: null,
          draftRevisionCount: 0,
          confidence,
          humanRequired: reviewNeedsHuman({
            reviewBody: record.reviewBody,
            rating: record.rating ?? 0,
            confidence,
            settings: appSettings,
            productMismatch: generated.productMismatch,
          }),
          lastError: null,
        },
      });
      result.generated += 1;
      result.generatedIds.push(record.id);
    } catch (error) {
      const details = compactError(error);
      result.failed += 1;
      result.errors.push({
        id: record.id,
        reviewId: record.sourceReviewId,
        customer: record.customerName,
        message: errorMessage(error),
        details,
      });
      await db.reviewDraft.update({
        where: { id: record.id },
        data: { lastError: details },
      });
    }
  }

  result.credits.refunded = result.failed * result.credits.costPerDraft;
  result.credits.spent = Math.max(0, charge.amount - result.credits.refunded);
  if (result.credits.refunded) {
    await refundCredits(shop, result.credits.refunded, {
      description: `Refund ${result.failed} failed regenerated ${result.failed === 1 ? "reply" : "replies"}`,
      referenceType: "queue_regenerate_refund",
      referenceId: charge.id ?? undefined,
      metadata: { modelId: brandVoice.selectedModel, failed: result.failed },
    });
  }

  return result;
}

export async function updateDraft(shop: string, id: string, draft: string) {
  const record = await db.reviewDraft.findFirst({
    where: { shop, id, status: "pending" },
  });
  if (!record) return;

  const appSettings = await loadAppSettings(shop);
  const productTags = readStringListJson(record.productTagsJson);
  const productMismatch = reviewProductContextMismatch({
    reviewBody: record.reviewBody,
    productTitle: record.productTitle,
    productType: record.productType,
    productTags,
  });
  const draftConfidence = buildConfidence({
    reviewBody: record.reviewBody,
    rating: record.rating ?? 0,
    draft,
    productTitle: record.productTitle,
    productType: record.productType,
    productTags,
  });
  const confidence = confidenceWithProductMismatch(draftConfidence, appSettings, productMismatch);

  await db.reviewDraft.updateMany({
    where: { shop, id, status: "pending" },
    data: {
      draft,
      draftGeneratedAt: new Date(),
      draftEditedAt: new Date(),
      draftRevisionCount: { increment: 1 },
      confidence,
      humanRequired: reviewNeedsHuman({
        reviewBody: record.reviewBody,
        rating: record.rating ?? 0,
        confidence,
        settings: appSettings,
        productMismatch,
      }),
      lastError: null,
    },
  });
}

export async function reviseDraft(shop: string, id: string, instruction: string, admin?: AdminGraphql) {
  const trimmedInstruction = instruction.trim().slice(0, 100);
  if (!trimmedInstruction) return null;

  const record = await db.reviewDraft.findFirst({
    where: { shop, id, status: "pending", draft: { not: "" } },
  });
  if (!record) return null;

  const [products, brandVoice, appSettings] = await Promise.all([
    loadShopifyProducts(admin).catch(() => [] as ShopifyProductSummary[]),
    loadBrandVoiceForDrafts(shop),
    loadAppSettings(shop),
  ]);
  const productContext = await productContextForRecord(record, products, {
    admin,
    useProductDescription: appSettings.useProductDescription,
    productCache: new Map(),
  });
  const cost = creditCostForReviewReply(brandVoice.selectedModel, {
    useProductDescription: appSettings.useProductDescription,
  });
  const charge = await spendCredits(shop, cost, {
    description: "Revise review reply",
    referenceType: "queue_revise",
    referenceId: record.id,
    metadata: {
      modelId: brandVoice.selectedModel,
      useProductDescription: appSettings.useProductDescription,
    },
  });

  try {
    const result = await generateReviewReplyRevisionText({
      modelId: brandVoice.selectedModel,
      context: {
        personality: brandVoice.personality,
        greeting: brandVoice.greeting,
        signOff: brandVoice.signOff,
        alwaysMention: brandVoice.alwaysMention,
        avoidPhrases: brandVoice.avoidPhrases,
        personalityStyle: brandVoice.personalityStyle,
        personalityStrength: brandVoice.personalityStrength,
        replyLength: brandVoice.replyLength,
        customerName: record.customerName,
        reviewBody: record.reviewBody,
        rating: record.rating,
        productTitle: productContext.productTitle,
        productType: productContext.productType,
        productTags: productContext.productTags,
        productDescription: productContext.productDescription,
        currentDraft: record.draft,
        instruction: trimmedInstruction,
      },
    });
    const productMismatch = reviewProductContextMismatch({
      reviewBody: record.reviewBody,
      productTitle: productContext.productTitle,
      productType: productContext.productType,
      productTags: productContext.productTags,
      productDescription: productContext.productDescription,
    });
    const draftConfidence = buildConfidence({
      reviewBody: record.reviewBody,
      rating: record.rating ?? 0,
      draft: result.reply,
      productTitle: productContext.productTitle,
      productType: productContext.productType,
      productTags: productContext.productTags,
    });
    const confidence = confidenceWithProductMismatch(draftConfidence, appSettings, productMismatch);

    await db.reviewDraft.update({
      where: { id: record.id },
      data: {
        draft: result.reply,
        productType: productContext.productType || null,
        productTagsJson: compactTags(productContext.productTags),
        aiModelId: result.model.id,
        aiModelName: result.model.name,
        aiProviderName: result.model.provider,
        aiProviderModel: result.model.model,
        draftEditedAt: new Date(),
        draftRevisionCount: { increment: 1 },
        confidence,
        humanRequired: reviewNeedsHuman({
          reviewBody: record.reviewBody,
          rating: record.rating ?? 0,
          confidence,
          settings: appSettings,
          productMismatch,
        }),
        lastError: null,
      },
    });

    return { id: record.id, model: result.model, credits: { spent: charge.amount } };
  } catch (error) {
    await refundCredits(shop, cost, {
      description: "Refund failed review reply revision",
      referenceType: "queue_revise_refund",
      referenceId: charge.id ?? undefined,
      metadata: { modelId: brandVoice.selectedModel, reviewId: record.id },
    });
    throw error;
  }
}

export async function skipDrafts(shop: string, ids: string[]) {
  const result = await db.reviewDraft.updateMany({
    where: { shop, id: { in: ids }, status: "pending" },
    data: {
      status: "skipped",
      skippedAt: new Date(),
    },
  });

  return result.count;
}

export async function restoreDrafts(shop: string, ids: string[]) {
  const result = await db.reviewDraft.updateMany({
    where: { shop, id: { in: ids }, status: "skipped" },
    data: {
      status: "pending",
      skippedAt: null,
    },
  });

  return result.count;
}

async function markDraftAsExternalJudgeMeReply(
  record: Awaited<ReturnType<typeof db.reviewDraft.findMany>>[number],
  message: string,
) {
  const sourceReview = safeJsonParse(record.sourceReviewJson);
  await db.reviewDraft.update({
    where: { id: record.id },
    data: {
      sourceReviewJson: compactJson(markRawReviewAsAlreadyReplied(sourceReview, message)),
      draft: "",
      confidence: 0,
      aiModelId: null,
      aiModelName: null,
      aiProviderName: null,
      aiProviderModel: null,
      draftGeneratedAt: null,
      draftEditedAt: null,
      draftRevisionCount: 0,
      humanRequired: false,
      lastError: null,
    },
  });
}

export async function approveAndSendDrafts(shop: string, ids: string[]) {
  const credentials = await getConnectedJudgeMeCredentials(shop);
  if (!credentials) {
    throw new JudgeMeApiError("Connect Judge.me before approving replies.");
  }

  const appSettings = await loadAppSettings(shop);
  const records = await db.reviewDraft.findMany({
    where: { shop, id: { in: ids }, status: "pending", draft: { not: "" } },
  });
  const errors: Array<{ id: string; reviewId: string; message: string }> = [];
  const alreadyReplied: Array<{ id: string; reviewId: string; message: string }> = [];
  let sent = 0;

  for (const record of records) {
    try {
      const sourceReply = extractJudgeMeSourceReply(safeJsonParse(record.sourceReviewJson));
      if (sourceReply?.present) {
        const message = sourceReply.contentAvailable
          ? "Judge.me already has a public reply for this review. ReplyPulse AI: Review Replies did not send or change anything."
          : "Judge.me already has an external reply for this review, but ReplyPulse AI: Review Replies could not import the reply text.";
        alreadyReplied.push({ id: record.id, reviewId: record.sourceReviewId, message });
        await markDraftAsExternalJudgeMeReply(record, message);
        continue;
      }

      const numericReviewId = Number(record.sourceReviewId);
      await callJudgeMeApi("/replies", {
        method: "POST",
        apiToken: credentials.apiToken,
        shopDomain: credentials.shopDomain,
        body: {
          review_id: Number.isNaN(numericReviewId) ? record.sourceReviewId : numericReviewId,
          send_reply_email: appSettings.sendReplyEmail,
          reply: { content: record.draft },
        },
      });

      await db.reviewDraft.update({
        where: { id: record.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          lastError: null,
        },
      });
      sent += 1;
    } catch (error) {
      if (judgeMeAlreadyRepliedMessage(error)) {
        const message = "Judge.me rejected this review because it already has a reply. ReplyPulse AI: Review Replies did not send or change anything.";
        alreadyReplied.push({ id: record.id, reviewId: record.sourceReviewId, message });
        await markDraftAsExternalJudgeMeReply(record, message);
      } else {
        const message = error instanceof Error ? error.message : "Unknown Judge.me send error";
        errors.push({ id: record.id, reviewId: record.sourceReviewId, message });
        await db.reviewDraft.update({
          where: { id: record.id },
          data: { lastError: message },
        });
      }
    }
  }

  return { sent, errors, alreadyReplied };
}
