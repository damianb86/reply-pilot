import type { Session } from "@shopify/shopify-api";
import db from "./db.server";
import { sendContactEmail } from "./email.server";

export const LIFECYCLE_INSTALLED = "lifecycle:installed";
export const LIFECYCLE_UNINSTALLED = "lifecycle:uninstalled";

type LifecycleEventType =
  | typeof LIFECYCLE_INSTALLED
  | typeof LIFECYCLE_UNINSTALLED;

type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

type ShopInstallDetails = {
  name?: string | null;
  email?: string | null;
  contactEmail?: string | null;
  myshopifyDomain?: string | null;
  ianaTimezone?: string | null;
  primaryDomain?: {
    host?: string | null;
    url?: string | null;
  } | null;
  plan?: {
    publicDisplayName?: string | null;
    partnerDevelopment?: boolean | null;
  } | null;
};

const SHOP_INSTALL_NOTIFICATION_QUERY = `#graphql
  query AppInstallNotificationShop {
    shop {
      name
      email
      contactEmail
      myshopifyDomain
      ianaTimezone
      primaryDomain {
        host
        url
      }
      plan {
        publicDisplayName
        partnerDevelopment
      }
    }
  }
` as string;

function valueOrMissing(value: unknown) {
  if (value === null || value === undefined || value === "") return "not provided";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable payload]";
  }
}

function payloadValue(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  return record[key];
}

export function shouldSendLifecycleNotification(
  lastType: string | null | undefined,
  nextType: LifecycleEventType,
) {
  return lastType !== nextType;
}

async function lastLifecycleEventType(shop: string) {
  const event = await db.contactRequest.findFirst({
    where: {
      shop,
      type: {
        in: [LIFECYCLE_INSTALLED, LIFECYCLE_UNINSTALLED],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      type: true,
    },
  });

  return event?.type ?? null;
}

async function recordLifecycleEvent({
  email,
  message,
  shop,
  subject,
  type,
}: {
  email?: string | null;
  message: string;
  shop: string;
  subject: string;
  type: LifecycleEventType;
}) {
  await db.contactRequest.create({
    data: {
      shop,
      type,
      subject,
      message,
      email: email ?? null,
    },
  });
}

async function loadShopInstallDetails(admin: AdminGraphql) {
  const response = await admin.graphql(SHOP_INSTALL_NOTIFICATION_QUERY);
  const json = (await response.json()) as {
    data?: {
      shop?: ShopInstallDetails | null;
    };
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }

  return json.data?.shop ?? null;
}

export function buildInstallNotificationMessage({
  session,
  shopDetails,
  triggeredAt = new Date(),
}: {
  session: Pick<Session, "shop" | "scope" | "isOnline" | "expires">;
  shopDetails?: ShopInstallDetails | null;
  triggeredAt?: Date;
}) {
  return [
    "ReplyPulse was installed or reauthorized by a Shopify store.",
    "",
    `Installed at: ${triggeredAt.toISOString()}`,
    `Shop: ${session.shop}`,
    `Shop name: ${valueOrMissing(shopDetails?.name)}`,
    `Shop email: ${valueOrMissing(shopDetails?.email)}`,
    `Contact email: ${valueOrMissing(shopDetails?.contactEmail)}`,
    `MyShopify domain: ${valueOrMissing(shopDetails?.myshopifyDomain)}`,
    `Primary domain: ${valueOrMissing(shopDetails?.primaryDomain?.url || shopDetails?.primaryDomain?.host)}`,
    `Plan: ${valueOrMissing(shopDetails?.plan?.publicDisplayName)}`,
    `Partner development store: ${valueOrMissing(shopDetails?.plan?.partnerDevelopment)}`,
    `Timezone: ${valueOrMissing(shopDetails?.ianaTimezone)}`,
    `Granted scopes: ${valueOrMissing(session.scope)}`,
    `Session mode: ${session.isOnline ? "online" : "offline"}`,
    `Session expires: ${session.expires ? session.expires.toISOString() : "offline session"}`,
    "",
    "Access tokens are stored in session storage and are not included in this email.",
  ].join("\n");
}

export function buildUninstallNotificationMessage({
  payload,
  shop,
  topic,
  triggeredAt = new Date(),
}: {
  payload: unknown;
  shop: string;
  topic?: string;
  triggeredAt?: Date;
}) {
  return [
    "ReplyPulse was uninstalled by a Shopify store.",
    "",
    `Uninstalled at: ${triggeredAt.toISOString()}`,
    `Topic: ${valueOrMissing(topic)}`,
    `Shop: ${shop}`,
    `Shop ID: ${valueOrMissing(payloadValue(payload, "id"))}`,
    `Shop name: ${valueOrMissing(payloadValue(payload, "name"))}`,
    `Shop email: ${valueOrMissing(payloadValue(payload, "email"))}`,
    `Customer email: ${valueOrMissing(payloadValue(payload, "customer_email"))}`,
    `Domain: ${valueOrMissing(payloadValue(payload, "domain"))}`,
    `MyShopify domain: ${valueOrMissing(payloadValue(payload, "myshopify_domain"))}`,
    `Plan: ${valueOrMissing(payloadValue(payload, "plan_name") || payloadValue(payload, "plan_display_name"))}`,
    "",
    "Raw Shopify webhook payload:",
    safeJson(payload),
  ].join("\n");
}

export async function notifyAppInstalled({
  admin,
  session,
}: {
  admin: AdminGraphql;
  session: Session;
}) {
  const lastType = await lastLifecycleEventType(session.shop);
  if (!shouldSendLifecycleNotification(lastType, LIFECYCLE_INSTALLED)) {
    return { skipped: true };
  }

  const shopDetails = await loadShopInstallDetails(admin);
  const message = buildInstallNotificationMessage({ session, shopDetails });
  const subject = `App installed - ${shopDetails?.name || session.shop}`;
  const replyEmail = shopDetails?.contactEmail || shopDetails?.email || undefined;

  await sendContactEmail({
    type: "App lifecycle: installed",
    subject,
    message,
    replyEmail,
    shop: session.shop,
  });

  await recordLifecycleEvent({
    email: replyEmail,
    message,
    shop: session.shop,
    subject,
    type: LIFECYCLE_INSTALLED,
  });

  return { skipped: false };
}

export async function notifyAppUninstalled({
  payload,
  shop,
  topic,
}: {
  payload: unknown;
  shop: string;
  topic?: string;
}) {
  const lastType = await lastLifecycleEventType(shop);
  if (!shouldSendLifecycleNotification(lastType, LIFECYCLE_UNINSTALLED)) {
    return { skipped: true };
  }

  const message = buildUninstallNotificationMessage({ payload, shop, topic });
  const subject = `App uninstalled - ${shop}`;
  const replyEmail =
    String(payloadValue(payload, "customer_email") || payloadValue(payload, "email") || "") ||
    undefined;

  await sendContactEmail({
    type: "App lifecycle: uninstalled",
    subject,
    message,
    replyEmail,
    shop,
  });

  await recordLifecycleEvent({
    email: replyEmail,
    message,
    shop,
    subject,
    type: LIFECYCLE_UNINSTALLED,
  });

  return { skipped: false };
}
