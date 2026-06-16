import db from "./db.server";
import { getReviewSourceConnectionView } from "./review-source.server";
import { syncReviewSourceReviews } from "./reviews.server";
import {
  cleanupExpiredReviewHistory,
  isSameTimeZoneDay,
  loadAppSettings,
  recentTimeZoneDays,
  timeZoneDayKey,
} from "./settings.server";

type AdminGraphql = Parameters<typeof syncReviewSourceReviews>[1];
type SentRecord = Awaited<ReturnType<typeof db.reviewDraft.findMany>>[number];

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

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "RP";
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function ageLabel(date?: Date | null) {
  if (!date) return "sent";
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function responseMinutes(record: SentRecord) {
  if (!record.sentAt || !record.sourceCreatedAt) return null;
  const minutes = Math.round((record.sentAt.getTime() - record.sourceCreatedAt.getTime()) / 60000);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function sentStatus(record: SentRecord) {
  if (record.draftRevisionCount > 0) return "edited";
  if (!record.aiModelId) return "manual";
  return "generated";
}

function mapSentReply(record: SentRecord) {
  const minutesToSend = responseMinutes(record);

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
    reply: record.draft,
    status: sentStatus(record),
    confidence: record.confidence,
    human: record.humanRequired,
    age: ageLabel(record.sentAt),
    sentAt: record.sentAt?.toISOString() ?? null,
    sourceCreatedAt: record.sourceCreatedAt?.toISOString() ?? null,
    draftGeneratedAt: record.draftGeneratedAt?.toISOString() ?? null,
    draftEditedAt: record.draftEditedAt?.toISOString() ?? null,
    draftRevisionCount: record.draftRevisionCount,
    minutesToSend,
    aiModel: record.aiModelId
      ? {
          id: record.aiModelId,
          name: record.aiModelName || record.aiModelId,
          provider: record.aiProviderName || "",
          model: record.aiProviderModel || "",
        }
      : null,
  };
}

function buildWeekBars(records: SentRecord[], timeZone: string) {
  const days = recentTimeZoneDays(7, timeZone);
  const counts = new Map(days.map((date) => [date.key, 0]));

  for (const record of records) {
    if (!record.sentAt) continue;
    const key = timeZoneDayKey(record.sentAt, timeZone);
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const maxCount = Math.max(1, ...Array.from(counts.values()));

  return days.map((date) => {
    const count = counts.get(date.key) ?? 0;
    return {
      date: date.key,
      day: date.day,
      count,
      height: count ? Math.max(18, Math.round((count / maxCount) * 86)) : 18,
    };
  });
}

export async function loadSentPageData(shop: string) {
  const settings = await loadAppSettings(shop);
  await cleanupExpiredReviewHistory(shop, settings);
  const connection = await getReviewSourceConnectionView(shop);
  const sourceWhere = connection?.status === "connected" ? { source: connection.provider } : {};
  const last7Keys = new Set(recentTimeZoneDays(7, settings.timezone).map((day) => day.key));
  const [records, totalSent] = await Promise.all([
    db.reviewDraft.findMany({
      where: { shop, status: "sent", ...sourceWhere },
      orderBy: [{ sentAt: "desc" }, { updatedAt: "desc" }],
      take: 500,
    }),
    db.reviewDraft.count({ where: { shop, status: "sent", ...sourceWhere } }),
  ]);

  const sentReplies = records.map(mapSentReply);
  const minutes = records.map(responseMinutes).filter((value): value is number => value !== null);
  const avgResponseMinutes = minutes.length
    ? Math.round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length)
    : null;
  const sentToday = records.filter((record) =>
    isSameTimeZoneDay(record.sentAt, new Date(), settings.timezone),
  ).length;
  const sentLast7Days = records.filter((record) =>
    record.sentAt && last7Keys.has(timeZoneDayKey(record.sentAt, settings.timezone)),
  ).length;
  const editedCount = records.filter((record) => sentStatus(record) === "edited").length;
  const generatedCount = records.filter((record) => sentStatus(record) === "generated").length;
  const manualCount = records.filter((record) => sentStatus(record) === "manual").length;
  const products = Array.from(new Set(sentReplies.map((reply) => reply.product))).sort();

  return {
    sentReplies,
    products,
    settings,
    connectionProvider: connection?.provider ?? null,
    connectionProviderName: connection?.providerName ?? null,
    weekBars: buildWeekBars(records, settings.timezone),
    stats: {
      total: records.length,
      totalStored: totalSent,
      sentToday,
      sentLast7Days,
      edited: editedCount,
      generated: generatedCount,
      manual: manualCount,
      avgResponseMinutes,
      estimatedMinutesSaved: records.length * 4,
      lastSentAt: records[0]?.sentAt?.toISOString() ?? null,
    },
  };
}

export async function refreshSentPageData(shop: string, admin?: AdminGraphql) {
  const syncResult = await syncReviewSourceReviews(shop, admin);
  return {
    syncResult,
    ...(await loadSentPageData(shop)),
  };
}
