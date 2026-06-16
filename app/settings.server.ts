import db from "./db.server";

export type AppSettings = {
  highConfidenceThreshold: number;
  humanReviewThreshold: number;
  routeSensitiveReviews: boolean;
  routeLowStarReviews: boolean;
  sendReplyEmail: boolean;
  useProductDescription: boolean;
  onboardingCompleted: boolean;
  showSkippedByDefault: boolean;
  showSentByDefault: boolean;
  dataRetention: "12-months" | "24-months" | "forever";
  timezone: string;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  highConfidenceThreshold: 85,
  humanReviewThreshold: 75,
  routeSensitiveReviews: true,
  routeLowStarReviews: true,
  sendReplyEmail: false,
  useProductDescription: true,
  onboardingCompleted: false,
  showSkippedByDefault: false,
  showSentByDefault: false,
  dataRetention: "12-months",
  timezone: "America/Argentina/Cordoba",
};

const SENSITIVE_REVIEW_TERMS = [
  "allergic",
  "allergy",
  "chargeback",
  "counterfeit",
  "dangerous",
  "damaged",
  "defective",
  "delivery",
  "doesn't work",
  "estafa",
  "exchange",
  "fake",
  "fraud",
  "fraude",
  "refund",
  "injury",
  "lawsuit",
  "legal",
  "lost",
  "missing",
  "never arrived",
  "no llego",
  "not arrived",
  "peligroso",
  "reembolso",
  "return",
  "broken",
  "roto",
  "scam",
  "shipping",
  "stopped working",
  "tracking",
  "unsafe",
  "unusable",
  "wrong item",
  "angry",
  "disappointed",
  "urgent",
  "nothing",
];

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readSettingsJson(value?: string | null) {
  if (!value) return {};
  try {
    return readObject(JSON.parse(value));
  } catch {
    return {};
  }
}

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function enumValue<T extends string>(value: unknown, fallback: T, allowed: readonly T[]) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true" || value === "on" || value === "1") return true;
    if (value === "false" || value === "off" || value === "0") return false;
  }
  return fallback;
}

function normalizeTimeZone(value: unknown) {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_APP_SETTINGS.timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_APP_SETTINGS.timezone;
  }
}

function normalizeSettings(input: Record<string, unknown>): AppSettings {
  return {
    highConfidenceThreshold: numberInRange(
      input.highConfidenceThreshold,
      DEFAULT_APP_SETTINGS.highConfidenceThreshold,
      70,
      98,
    ),
    humanReviewThreshold: numberInRange(
      input.humanReviewThreshold,
      DEFAULT_APP_SETTINGS.humanReviewThreshold,
      40,
      95,
    ),
    routeSensitiveReviews: booleanValue(input.routeSensitiveReviews, DEFAULT_APP_SETTINGS.routeSensitiveReviews),
    routeLowStarReviews: booleanValue(input.routeLowStarReviews, DEFAULT_APP_SETTINGS.routeLowStarReviews),
    sendReplyEmail: booleanValue(input.sendReplyEmail, DEFAULT_APP_SETTINGS.sendReplyEmail),
    useProductDescription: booleanValue(input.useProductDescription, DEFAULT_APP_SETTINGS.useProductDescription),
    onboardingCompleted: booleanValue(input.onboardingCompleted, DEFAULT_APP_SETTINGS.onboardingCompleted),
    showSkippedByDefault: booleanValue(input.showSkippedByDefault, DEFAULT_APP_SETTINGS.showSkippedByDefault),
    showSentByDefault: booleanValue(input.showSentByDefault, DEFAULT_APP_SETTINGS.showSentByDefault),
    dataRetention: enumValue(input.dataRetention, DEFAULT_APP_SETTINGS.dataRetention, [
      "12-months",
      "24-months",
      "forever",
    ]),
    timezone: normalizeTimeZone(input.timezone),
  };
}

export function settingsFromFormData(formData: FormData) {
  return normalizeSettings({
    highConfidenceThreshold: formData.get("highConfidenceThreshold"),
    humanReviewThreshold: formData.get("humanReviewThreshold"),
    routeSensitiveReviews: formData.get("routeSensitiveReviews"),
    routeLowStarReviews: formData.get("routeLowStarReviews"),
    sendReplyEmail: formData.get("sendReplyEmail"),
    useProductDescription: formData.get("useProductDescription"),
    onboardingCompleted: formData.get("onboardingCompleted"),
    showSkippedByDefault: formData.get("showSkippedByDefault"),
    showSentByDefault: formData.get("showSentByDefault"),
    dataRetention: formData.get("dataRetention"),
    timezone: formData.get("timezone"),
  });
}

export async function loadAppSettings(shop: string): Promise<AppSettings> {
  const record = await db.appSetting.findUnique({ where: { shop } });
  return normalizeSettings(readSettingsJson(record?.settingsJson));
}

export async function saveAppSettings(shop: string, input: AppSettings) {
  const settings = normalizeSettings(input);
  await db.appSetting.upsert({
    where: { shop },
    update: { settingsJson: JSON.stringify(settings) },
    create: { shop, settingsJson: JSON.stringify(settings) },
  });
  return settings;
}

function retentionCutoff(settings: AppSettings) {
  const days = settings.dataRetention === "24-months" ? 730 : settings.dataRetention === "12-months" ? 365 : 0;
  if (!days) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function cleanupExpiredReviewHistory(shop: string, settings?: AppSettings) {
  const appSettings = settings ?? (await loadAppSettings(shop));
  const cutoff = retentionCutoff(appSettings);
  if (!cutoff) return { deleted: 0, retention: appSettings.dataRetention };

  const result = await db.reviewDraft.deleteMany({
    where: {
      shop,
      OR: [
        { status: "sent", sentAt: { lt: cutoff } },
        { status: "skipped", skippedAt: { lt: cutoff } },
      ],
    },
  });

  return { deleted: result.count, retention: appSettings.dataRetention };
}

export function isSensitiveReview(reviewBody: string) {
  const text = reviewBody
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return SENSITIVE_REVIEW_TERMS.some((term) =>
    text.includes(
      term
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase(),
    ),
  );
}

export function reviewNeedsHuman(input: {
  reviewBody: string;
  rating: number;
  confidence: number;
  settings: AppSettings;
  productMismatch?: boolean;
}) {
  const sensitive = input.settings.routeSensitiveReviews && isSensitiveReview(input.reviewBody);
  const lowStarNeedsExtraReview =
    input.settings.routeLowStarReviews &&
    input.rating <= 2 &&
    (sensitive || input.confidence < Math.max(82, input.settings.humanReviewThreshold + 8));

  return (
    input.confidence < input.settings.humanReviewThreshold ||
    Boolean(input.productMismatch) ||
    lowStarNeedsExtraReview ||
    sensitive
  );
}

export function timeZoneDayKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function isSameTimeZoneDay(date: Date | null | undefined, compareTo: Date, timeZone: string) {
  if (!date) return false;
  return timeZoneDayKey(date, timeZone) === timeZoneDayKey(compareTo, timeZone);
}

export function recentTimeZoneDays(count: number, timeZone: string) {
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getTime() - (count - 1 - index) * 24 * 60 * 60 * 1000);
    const key = timeZoneDayKey(date, timeZone);
    return {
      key,
      day: new Intl.DateTimeFormat("en", { weekday: "short", timeZone }).format(date),
    };
  });
}
