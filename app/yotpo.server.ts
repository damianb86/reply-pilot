import db from "./db.server";
import { decryptSecret, encryptSecret } from "./judgeme.server";

const YOTPO_API_BASE = process.env.YOTPO_API_BASE_URL || "https://api.yotpo.com";
const DEFAULT_YOTPO_TIMEOUT_MS = 10000;

type JsonObject = Record<string, unknown>;

export class YotpoApiError extends Error {
  status?: number;
  statusText?: string;
  details?: unknown;

  constructor(message: string, options: { status?: number; statusText?: string; details?: unknown } = {}) {
    super(message);
    this.name = "YotpoApiError";
    this.status = options.status;
    this.statusText = options.statusText;
    this.details = options.details;
  }
}

function yotpoTimeoutMs() {
  const value = Number(process.env.YOTPO_API_TIMEOUT_MS || DEFAULT_YOTPO_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_YOTPO_TIMEOUT_MS;
}

function readObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readStringList(value: unknown) {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const object = readObject(item);
      return readString(object.message) || readString(object.error) || readString(object.detail);
    })
    .filter((item): item is string => Boolean(item));
}

function readCount(value: unknown) {
  const data = readObject(value);
  const candidates = [
    data.count,
    data.total,
    data.total_count,
    data.review_count,
    data.reviews_count,
    data.total_reviews,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number") return candidate;
    if (typeof candidate === "string" && candidate.trim() && !Number.isNaN(Number(candidate))) {
      return Number(candidate);
    }
  }

  return null;
}

function compactJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function safeJsonParse(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeStoreId(value: string) {
  return value.trim();
}

export function maskYotpoSecret(secret: string) {
  if (secret.length <= 10) return "••••";
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

async function parseYotpoResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function yotpoResponseMessage(body: unknown) {
  if (typeof body === "string" && body.trim()) return body.trim();

  const data = readObject(body);
  const directMessage =
    readString(data.error_description) ||
    readString(data.error) ||
    readString(data.message) ||
    readString(data.detail);
  if (directMessage === "invalid_client") return "Yotpo rejected the Store ID or API secret.";
  if (directMessage === "unsupported_grant_type") return "Yotpo rejected the authentication grant type.";
  if (directMessage) return directMessage;

  const messages = [
    ...readStringList(data.errors),
    ...readStringList(data.messages),
  ].join(" ");

  return messages || null;
}

export async function generateYotpoAccessToken(storeId: string, apiSecret: string) {
  const timeoutMs = yotpoTimeoutMs();
  const normalizedStoreId = normalizeStoreId(storeId);
  const url = new URL(`${YOTPO_API_BASE}/oauth/token`);
  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: normalizedStoreId,
        client_secret: apiSecret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    const message = isTimeout
      ? `Yotpo did not respond within ${Math.round(timeoutMs / 1000)} seconds. Please try again later.`
      : error instanceof Error
        ? error.message
        : "Could not reach Yotpo.";

    throw new YotpoApiError(message, {
      details: {
        endpoint: "/oauth/token",
        storeId: normalizedStoreId,
        timeoutMs,
      },
    });
  }

  const body = await parseYotpoResponse(response);

  if (!response.ok) {
    throw new YotpoApiError(
      yotpoResponseMessage(body) || `Yotpo authentication failed with ${response.status} ${response.statusText}`,
      {
        status: response.status,
        statusText: response.statusText,
        details: {
          endpoint: "/oauth/token",
          storeId: normalizedStoreId,
          response: body,
        },
      },
    );
  }

  const data = readObject(body);
  const accessToken = readString(data.access_token);
  if (!accessToken) {
    throw new YotpoApiError("Yotpo did not return an access token.", {
      details: {
        endpoint: "/oauth/token",
        storeId: normalizedStoreId,
        response: body,
      },
    });
  }

  return {
    accessToken,
    tokenType: readString(data.token_type) || "bearer",
  };
}

export async function callYotpoApi(
  path: string,
  options: {
    accessToken: string;
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    searchParams?: Record<string, string | string[] | number | boolean | undefined>;
  },
) {
  const timeoutMs = yotpoTimeoutMs();
  const url = new URL(`${YOTPO_API_BASE}${path}`);

  for (const [key, value] of Object.entries(options.searchParams ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "X-Yotpo-Token": options.accessToken,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    const message = isTimeout
      ? `Yotpo did not respond within ${Math.round(timeoutMs / 1000)} seconds. Please try again later.`
      : error instanceof Error
        ? error.message
        : "Could not reach Yotpo.";

    throw new YotpoApiError(message, {
      details: {
        endpoint: path,
        timeoutMs,
      },
    });
  }

  const body = await parseYotpoResponse(response);

  if (!response.ok) {
    throw new YotpoApiError(
      yotpoResponseMessage(body) || `Yotpo request failed with ${response.status} ${response.statusText}`,
      {
        status: response.status,
        statusText: response.statusText,
        details: {
          endpoint: path,
          response: body,
        },
      },
    );
  }

  return body;
}

export async function getConnectedYotpoCredentials(shop: string) {
  const connection = await db.yotpoConnection.findUnique({ where: { shop } });
  if (!connection || connection.status !== "connected") return null;

  const apiSecret = decryptSecret(connection.encryptedApiSecret);
  const token = await generateYotpoAccessToken(connection.storeId, apiSecret);

  return {
    storeId: connection.storeId,
    apiSecret,
    accessToken: token.accessToken,
  };
}

export async function commentOnYotpoReview(input: {
  storeId: string;
  accessToken: string;
  reviewId: string;
  content: string;
  publicComment?: boolean;
}) {
  return callYotpoApi(`/reviews/${encodeURIComponent(input.reviewId)}/comments`, {
    accessToken: input.accessToken,
    method: "POST",
    body: {
      utoken: input.accessToken,
      comment: {
        content: input.content,
        public: input.publicComment ?? true,
      },
    },
  });
}

export async function buildYotpoSnapshot(storeId: string, apiSecret: string) {
  const normalizedStoreId = normalizeStoreId(storeId);
  const token = await generateYotpoAccessToken(normalizedStoreId, apiSecret);
  const reviewsResponse = await callYotpoApi(`/v1/apps/${encodeURIComponent(normalizedStoreId)}/reviews`, {
    accessToken: token.accessToken,
    searchParams: {
      count: 5,
      page: 1,
      deleted: false,
    },
  });
  const reviews = Array.isArray(readObject(reviewsResponse).reviews)
    ? (readObject(reviewsResponse).reviews as unknown[])
    : [];

  return {
    storeId: normalizedStoreId,
    tokenType: token.tokenType,
    reviewCount: readCount(reviewsResponse) ?? reviews.length,
    sampleReviews: reviews.slice(0, 5),
    raw: {
      account: {
        storeId: normalizedStoreId,
        tokenType: token.tokenType,
      },
      reviews: reviewsResponse,
    },
  };
}

export async function testYotpoConnection(input: {
  storeId: string;
  apiSecret: string;
}) {
  return buildYotpoSnapshot(input.storeId, input.apiSecret);
}

export async function upsertYotpoConnection(input: {
  shop: string;
  storeId: string;
  apiSecret: string;
  authMethod: "store_id_api_secret";
}) {
  const snapshot = await buildYotpoSnapshot(input.storeId, input.apiSecret);
  const [, connection] = await db.$transaction([
    db.judgeMeConnection.deleteMany({ where: { shop: input.shop } }),
    db.yotpoConnection.upsert({
      where: { shop: input.shop },
      update: {
        storeId: snapshot.storeId,
        authMethod: input.authMethod,
        encryptedApiSecret: encryptSecret(input.apiSecret),
        secretMask: maskYotpoSecret(input.apiSecret),
        status: "connected",
        reviewCount: snapshot.reviewCount,
        lastVerifiedAt: new Date(),
        lastError: null,
        accountJson: compactJson(snapshot.raw.account),
        sampleReviewsJson: compactJson(snapshot.sampleReviews),
      },
      create: {
        shop: input.shop,
        storeId: snapshot.storeId,
        authMethod: input.authMethod,
        encryptedApiSecret: encryptSecret(input.apiSecret),
        secretMask: maskYotpoSecret(input.apiSecret),
        status: "connected",
        reviewCount: snapshot.reviewCount,
        lastVerifiedAt: new Date(),
        lastError: null,
        accountJson: compactJson(snapshot.raw.account),
        sampleReviewsJson: compactJson(snapshot.sampleReviews),
      },
    }),
  ]);

  return connection;
}

export async function refreshYotpoConnection(shop: string) {
  const connection = await db.yotpoConnection.findUnique({ where: { shop } });
  if (!connection) {
    throw new YotpoApiError("There is no Yotpo connection saved for this shop.");
  }

  try {
    const apiSecret = decryptSecret(connection.encryptedApiSecret);
    const snapshot = await buildYotpoSnapshot(connection.storeId, apiSecret);

    return db.yotpoConnection.update({
      where: { shop },
      data: {
        status: "connected",
        reviewCount: snapshot.reviewCount,
        lastVerifiedAt: new Date(),
        lastError: null,
        accountJson: compactJson(snapshot.raw.account),
        sampleReviewsJson: compactJson(snapshot.sampleReviews),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Yotpo error";
    await db.yotpoConnection.update({
      where: { shop },
      data: {
        status: "error",
        lastError: message,
      },
    });
    throw error;
  }
}

export async function getYotpoConnectionView(shop: string) {
  const connection = await db.yotpoConnection.findUnique({ where: { shop } });
  if (!connection) return null;

  return {
    id: connection.id,
    provider: "yotpo" as const,
    providerName: "Yotpo",
    shop: connection.shop,
    storeId: connection.storeId,
    connectedIdentifier: connection.storeId,
    authMethod: connection.authMethod,
    authMethodLabel: "Store ID and API secret",
    credentialLabel: "API secret",
    credentialMask: connection.secretMask,
    secretMask: connection.secretMask,
    status: connection.status,
    reviewCount: connection.reviewCount,
    lastVerifiedAt: connection.lastVerifiedAt?.toISOString() ?? null,
    lastError: connection.lastError,
    account: safeJsonParse(connection.accountJson),
    settings: null,
    sampleReviews: safeJsonParse(connection.sampleReviewsJson),
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export async function disconnectYotpo(shop: string) {
  await db.yotpoConnection.deleteMany({ where: { shop } });
}

export function serializeYotpoError(error: unknown) {
  if (error instanceof YotpoApiError) {
    return {
      message: error.message,
      status: error.status,
      statusText: error.statusText,
      details: error.details,
      providerName: "Yotpo",
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      details: error.stack,
      providerName: "Yotpo",
    };
  }

  return {
    message: "Unknown Yotpo connection error.",
    details: error,
    providerName: "Yotpo",
  };
}
