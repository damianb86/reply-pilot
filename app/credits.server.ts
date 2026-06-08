import db from "./db.server";
import { shouldUseTestBilling } from "./billing.server";
import { loadAppSettings } from "./settings.server";

type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

type CreditOperation = "reply" | "preview" | "personality";

const INITIAL_FREE_CREDITS = 100;
const FIRST_PURCHASE_BONUS_RATE = 0.35;
const FIRST_PURCHASE_BONUS_PERCENT = Math.round(FIRST_PURCHASE_BONUS_RATE * 100);
const DEFAULT_PRODUCT_DESCRIPTION_CREDIT_MULTIPLIER = 1;
const CREDIT_MULTIPLIERS: Record<string, number> = {
  dev: 0,
  basic: 1,
  pro: 4,
  premium: 12,
};
const OPERATION_BASE_COSTS: Record<CreditOperation, number> = {
  reply: 1,
  preview: 1,
  personality: 2,
};

export const CREDIT_PACKAGES = [
  {
    id: "starter",
    name: "Starter",
    credits: 1000,
    amountCents: 500,
    currencyCode: "USD",
    description: "A light top-up for setup, previews, and small review batches.",
  },
  {
    id: "growth",
    name: "Growth",
    credits: 3500,
    amountCents: 1500,
    currencyCode: "USD",
    description: "A practical pack for regular Queue work and weekly review batches.",
    recommended: true,
  },
  {
    id: "scale",
    name: "Scale",
    credits: 10000,
    amountCents: 3900,
    currencyCode: "USD",
    description: "Lower effective cost for stores with high review volume.",
  },
  {
    id: "business",
    name: "Business",
    credits: 30000,
    amountCents: 9900,
    currencyCode: "USD",
    description: "Best value for busy stores using Pro or Premium heavily.",
  },
];

const APP_PURCHASE_CREATE = `#graphql
  mutation AppCreditPurchaseCreate($name: String!, $returnUrl: URL!, $price: MoneyInput!, $test: Boolean) {
    appPurchaseOneTimeCreate(name: $name, returnUrl: $returnUrl, price: $price, test: $test) {
      confirmationUrl
      userErrors {
        field
        message
      }
      appPurchaseOneTime {
        id
        status
      }
    }
  }
`;

const APP_PURCHASE_STATUS = `#graphql
  query AppCreditPurchaseStatus($id: ID!) {
    node(id: $id) {
      ... on AppPurchaseOneTime {
        id
        status
      }
    }
  }
`;

export class CreditError extends Error {
  required?: number;
  balance?: number;
  shortfall?: number;

  constructor(message: string, details: { required?: number; balance?: number } = {}) {
    super(message);
    this.name = "CreditError";
    this.required = details.required;
    this.balance = details.balance;
    this.shortfall =
      details.required !== undefined && details.balance !== undefined
        ? normalizeCreditAmount(details.required - details.balance)
        : undefined;
  }
}

function resolveCreditModelId(modelId?: string | null) {
  if (modelId === "gemini-3-flash-preview") return "dev";
  if (modelId === "openai-gpt-5-4-mini") return "pro";
  return modelId && CREDIT_MULTIPLIERS[modelId] !== undefined ? modelId : "basic";
}

export function creditMultiplierForModel(modelId?: string | null) {
  return CREDIT_MULTIPLIERS[resolveCreditModelId(modelId)] ?? CREDIT_MULTIPLIERS.basic;
}

export function creditCostForOperation(modelId: string | null | undefined, operation: CreditOperation) {
  return OPERATION_BASE_COSTS[operation] * creditMultiplierForModel(modelId);
}

function normalizeCreditAmount(value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(Math.max(0, numeric).toFixed(4));
}

function configuredProductDescriptionMultiplier() {
  const configured = Number(
    process.env.PRODUCT_DESCRIPTION_CREDIT_MULTIPLIER ?? DEFAULT_PRODUCT_DESCRIPTION_CREDIT_MULTIPLIER,
  );
  return Number.isFinite(configured) && configured >= 1
    ? configured
    : DEFAULT_PRODUCT_DESCRIPTION_CREDIT_MULTIPLIER;
}

export function productDescriptionCreditMultiplier(enabled?: boolean | null) {
  return enabled ? configuredProductDescriptionMultiplier() : 1;
}

export function creditCostForReviewReply(
  modelId: string | null | undefined,
  options: { useProductDescription?: boolean | null } = {},
) {
  return normalizeCreditAmount(
    creditCostForOperation(modelId, "reply") * productDescriptionCreditMultiplier(options.useProductDescription),
  );
}

export function creditCostsForModel(modelId?: string | null) {
  return {
    multiplier: creditMultiplierForModel(modelId),
    reply: creditCostForOperation(modelId, "reply"),
    preview: creditCostForOperation(modelId, "preview"),
    personality: creditCostForOperation(modelId, "personality"),
  };
}

function formatCurrency(amountCents: number, currencyCode: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

function formatCreditCount(credits: number) {
  return new Intl.NumberFormat("en").format(Math.max(0, Math.round(credits)));
}

export function formatCreditAmount(credits: number) {
  const normalized = normalizeCreditAmount(Math.abs(Number(credits) || 0));
  const sign = Number(credits) < 0 ? "-" : "";
  const hasDecimals = !Number.isInteger(normalized);
  return `${sign}${new Intl.NumberFormat("en", {
    minimumFractionDigits: hasDecimals ? 1 : 0,
    maximumFractionDigits: hasDecimals ? 1 : 0,
  }).format(normalized)}`;
}

function firstPurchaseBonusCredits(credits: number) {
  return Math.round(credits * FIRST_PURCHASE_BONUS_RATE);
}

function creditPurchaseBillingName(pkg: (typeof CREDIT_PACKAGES)[number], bonusCredits: number) {
  const totalCredits = pkg.credits + bonusCredits;
  if (bonusCredits > 0) {
    return `ReplyPulse AI: Review Replies ${formatCreditCount(totalCredits)} credits (${formatCreditCount(pkg.credits)} + ${formatCreditCount(bonusCredits)} first-purchase bonus)`;
  }

  return `ReplyPulse AI: Review Replies ${formatCreditCount(pkg.credits)} credits`;
}

function packageView(pkg: (typeof CREDIT_PACKAGES)[number], includeFirstPurchaseBonus = false) {
  const bonusCredits = includeFirstPurchaseBonus ? firstPurchaseBonusCredits(pkg.credits) : 0;
  return {
    ...pkg,
    firstPurchaseBonusAvailable: includeFirstPurchaseBonus,
    firstPurchaseBonusCredits: bonusCredits,
    firstPurchaseTotalCredits: pkg.credits + bonusCredits,
    firstPurchaseBonusPercent: FIRST_PURCHASE_BONUS_PERCENT,
    price: pkg.amountCents / 100,
    priceLabel: formatCurrency(pkg.amountCents, pkg.currencyCode),
  };
}

async function accountForShop(shop: string, tx: typeof db = db) {
  const existing = await tx.creditAccount.findUnique({ where: { shop } });
  if (existing) return existing;

  try {
    return await tx.$transaction(async (transaction) => {
      const account = await transaction.creditAccount.create({
        data: {
          shop,
          startingCredits: INITIAL_FREE_CREDITS,
          balance: INITIAL_FREE_CREDITS,
        },
      });
      await transaction.creditLedgerEntry.create({
        data: {
          shop,
          type: "grant",
          amount: INITIAL_FREE_CREDITS,
          balanceAfter: INITIAL_FREE_CREDITS,
          description: "Welcome credits",
          referenceType: "initial",
          referenceId: shop,
        },
      });
      return account;
    });
  } catch {
    const account = await tx.creditAccount.findUnique({ where: { shop } });
    if (account) return account;
    throw new CreditError("Could not initialize credits for this shop.");
  }
}

async function firstPurchaseBonusAvailableForShop(shop: string) {
  const account = await accountForShop(shop);
  const latestPurchaseEntry = await db.creditLedgerEntry.findFirst({
    where: { shop, type: "purchase" },
    orderBy: { createdAt: "desc" },
  });

  return !latestPurchaseEntry && account.purchasedCredits === 0 && account.bonusCredits === 0;
}

export async function getCreditOverview(shop: string) {
  const account = await accountForShop(shop);
  const [latestPurchaseEntry, latestGrantEntry] = await Promise.all([
    db.creditLedgerEntry.findFirst({
      where: { shop, type: "purchase" },
      orderBy: { createdAt: "desc" },
    }),
    db.creditLedgerEntry.findFirst({
      where: { shop, type: "grant" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const latestMeterEntry = latestPurchaseEntry ?? latestGrantEntry;
  const firstPurchaseBonusAvailable = !latestPurchaseEntry && account.purchasedCredits === 0 && account.bonusCredits === 0;
  const totalAllocated =
    account.startingCredits + account.purchasedCredits + account.bonusCredits + account.refundedCredits;
  const creditMeterBase = Math.max(
    1,
    latestMeterEntry?.balanceAfter ?? account.startingCredits ?? INITIAL_FREE_CREDITS,
  );
  const creditMeterRemainingPercent = Math.min(
    100,
    Math.max(0, Math.round((account.balance / creditMeterBase) * 100)),
  );
  return {
    balance: account.balance,
    spent: account.spentCredits,
    purchased: account.purchasedCredits,
    bonus: account.bonusCredits,
    granted: account.startingCredits,
    refunded: account.refundedCredits,
    totalAllocated,
    usedPercent: totalAllocated > 0 ? Math.min(100, Math.round((account.spentCredits / totalAllocated) * 100)) : 0,
    creditMeter: {
      baseCredits: creditMeterBase,
      remainingPercent: creditMeterRemainingPercent,
      consumedPercent: 100 - creditMeterRemainingPercent,
      source: latestMeterEntry?.type === "purchase" ? "latest_purchase" : "welcome_grant",
    },
    firstPurchaseBonusAvailable,
    firstPurchaseBonusPercent: FIRST_PURCHASE_BONUS_PERCENT,
    packages: CREDIT_PACKAGES.map((pkg) => packageView(pkg, firstPurchaseBonusAvailable)),
    modelCosts: {
      dev: creditCostsForModel("dev"),
      basic: creditCostsForModel("basic"),
      pro: creditCostsForModel("pro"),
      premium: creditCostsForModel("premium"),
    },
  };
}

export async function spendCredits(
  shop: string,
  amount: number,
  input: {
    description: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const credits = normalizeCreditAmount(amount);
  const account = await accountForShop(shop);
  if (!credits) return { id: null, amount: 0, balanceAfter: account.balance };

  return db.$transaction(async (tx) => {
    const updated = await tx.creditAccount.updateMany({
      where: { shop, balance: { gte: credits } },
      data: {
        balance: { decrement: credits },
        spentCredits: { increment: credits },
      },
    });

    if (updated.count !== 1) {
      const latest = await tx.creditAccount.findUnique({ where: { shop } });
      throw new CreditError(
        `Not enough credits. ${formatCreditAmount(credits)} credits required, ${formatCreditAmount(latest?.balance ?? 0)} available.`,
        { required: credits, balance: latest?.balance ?? 0 },
      );
    }

    const latest = await tx.creditAccount.findUniqueOrThrow({ where: { shop } });
    const entry = await tx.creditLedgerEntry.create({
      data: {
        shop,
        type: "spend",
        amount: -credits,
        balanceAfter: latest.balance,
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });

    return { id: entry.id, amount: credits, balanceAfter: latest.balance };
  });
}

export async function refundCredits(
  shop: string,
  amount: number,
  input: {
    description: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const credits = normalizeCreditAmount(amount);
  if (!credits) return getCreditOverview(shop);
  await accountForShop(shop);

  await db.$transaction(async (tx) => {
    const account = await tx.creditAccount.update({
      where: { shop },
      data: {
        balance: { increment: credits },
        refundedCredits: { increment: credits },
      },
    });

    await tx.creditLedgerEntry.create({
      data: {
        shop,
        type: "refund",
        amount: credits,
        balanceAfter: account.balance,
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });
  });

  return getCreditOverview(shop);
}

async function grantPurchasedCredits(
  shop: string,
  purchaseId: string,
  credits: number,
  expectedBonusCredits = 0,
) {
  await accountForShop(shop);

  return db.$transaction(async (tx) => {
    const updatedPurchase = await tx.creditPurchase.updateMany({
      where: { id: purchaseId, shop, status: { not: "credited" } },
      data: { status: "credited", lastError: null },
    });

    if (updatedPurchase.count !== 1) {
      return { credited: false, credits, bonusCredits: 0, totalCredits: 0, firstPurchaseBonus: false };
    }

    let bonusCredits = 0;
    if (expectedBonusCredits) {
      const bonusUpdate = await tx.creditAccount.updateMany({
        where: { shop, purchasedCredits: 0, bonusCredits: 0 },
        data: {
          balance: { increment: expectedBonusCredits },
          bonusCredits: { increment: expectedBonusCredits },
        },
      });
      bonusCredits = bonusUpdate.count === 1 ? expectedBonusCredits : 0;
    }

    const account = await tx.creditAccount.update({
      where: { shop },
      data: {
        balance: { increment: credits },
        purchasedCredits: { increment: credits },
      },
    });

    await tx.creditLedgerEntry.create({
      data: {
        shop,
        type: "purchase",
        amount: credits,
        balanceAfter: account.balance,
        description: "Purchased credits",
        referenceType: "credit_purchase",
        referenceId: purchaseId,
        metadataJson: bonusCredits
          ? JSON.stringify({
              paidCredits: credits,
              firstPurchaseBonusCredits: bonusCredits,
              firstPurchaseBonusPercent: FIRST_PURCHASE_BONUS_PERCENT,
            })
          : null,
      },
    });

    if (bonusCredits) {
      await tx.creditLedgerEntry.create({
        data: {
          shop,
          type: "bonus",
          amount: bonusCredits,
          balanceAfter: account.balance,
          description: `${FIRST_PURCHASE_BONUS_PERCENT}% first purchase welcome bonus`,
          referenceType: "credit_purchase",
          referenceId: purchaseId,
          metadataJson: JSON.stringify({
            paidCredits: credits,
            bonusRate: FIRST_PURCHASE_BONUS_RATE,
          }),
        },
      });
    }

    return {
      credited: true,
      credits,
      bonusCredits,
      totalCredits: credits + bonusCredits,
      firstPurchaseBonus: bonusCredits > 0,
    };
  });
}

async function readGraphql(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readPackage(packageId: string) {
  const pkg = CREDIT_PACKAGES.find((candidate) => candidate.id === packageId);
  if (!pkg) throw new CreditError("Select a valid credit package.");
  return pkg;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createCreditPurchase(
  shop: string,
  packageId: string,
  admin: AdminGraphql,
  returnUrl: string,
) {
  const pkg = readPackage(packageId);
  const bonusAvailable = await firstPurchaseBonusAvailableForShop(shop);
  const bonusCredits = bonusAvailable ? firstPurchaseBonusCredits(pkg.credits) : 0;
  const totalCredits = pkg.credits + bonusCredits;
  const billingName = creditPurchaseBillingName(pkg, bonusCredits);
  const isTestBilling = await shouldUseTestBilling(admin);
  const purchase = await db.creditPurchase.create({
    data: {
      shop,
      packageId: pkg.id,
      credits: pkg.credits,
      bonusCredits,
      totalCredits,
      amountCents: pkg.amountCents,
      currencyCode: pkg.currencyCode,
      billingName,
      status: "pending",
    },
  });
  const callbackUrl = new URL(returnUrl);
  callbackUrl.searchParams.set("credit_purchase", purchase.id);

  try {
    const response = await admin.graphql(APP_PURCHASE_CREATE, {
      variables: {
        name: billingName,
        returnUrl: callbackUrl.toString(),
        price: {
          amount: pkg.amountCents / 100,
          currencyCode: pkg.currencyCode,
        },
        test: isTestBilling,
      },
    });
    const body = await readGraphql(response);
    const payload = readObject(readObject(body.data).appPurchaseOneTimeCreate);
    const userErrors = Array.isArray(payload.userErrors) ? payload.userErrors : [];

    if (userErrors.length) {
      const message = userErrors
        .map((error) => readObject(error).message)
        .filter(Boolean)
        .join(", ");
      throw new CreditError(message || "Shopify could not create the credit purchase.");
    }

    const appPurchase = readObject(payload.appPurchaseOneTime);
    const confirmationUrl = String(payload.confirmationUrl || "");
    const shopifyPurchaseId = String(appPurchase.id || "");
    if (!confirmationUrl || !shopifyPurchaseId) {
      throw new CreditError("Shopify did not return a confirmation URL for this credit purchase.");
    }

    await db.creditPurchase.update({
      where: { id: purchase.id },
      data: {
        shopifyPurchaseId,
        confirmationUrl,
        status: String(appPurchase.status || "pending").toLowerCase(),
      },
    });

    return { confirmationUrl, purchaseId: purchase.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create credit purchase.";
    await db.creditPurchase.update({
      where: { id: purchase.id },
      data: { status: "failed", lastError: message },
    });
    throw error;
  }
}

type FinalizeCreditPurchaseOptions = {
  chargeId?: string | null;
  settleApproval?: boolean;
};

async function readShopifyPurchaseStatus(admin: AdminGraphql, shopifyPurchaseId: string) {
  const response = await admin.graphql(APP_PURCHASE_STATUS, {
    variables: { id: shopifyPurchaseId },
  });
  const body = await readGraphql(response);
  const node = readObject(readObject(body.data).node);
  return String(node.status || "").toLowerCase();
}

export async function finalizeCreditPurchase(
  shop: string,
  purchaseId: string,
  admin: AdminGraphql,
  options: FinalizeCreditPurchaseOptions = {},
) {
  const purchase = await db.creditPurchase.findFirst({ where: { id: purchaseId, shop } });
  if (!purchase) {
    return { ok: false, message: "Credit purchase was not found." };
  }

  if (purchase.status === "credited") {
    const totalCredits = purchase.totalCredits || purchase.credits + purchase.bonusCredits;
    return { ok: true, message: `${formatCreditCount(totalCredits)} credits were already added.` };
  }

  if (!purchase.shopifyPurchaseId) {
    return { ok: false, message: "Credit purchase is missing Shopify confirmation data." };
  }

  let status = "";
  let attempts = 0;
  const maxAttempts = options.settleApproval ? 4 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    status = await readShopifyPurchaseStatus(admin, purchase.shopifyPurchaseId);
    if (status === "active" || status !== "pending" || attempt === maxAttempts) break;
    await sleep(1500);
  }

  console.info("[billing] credit purchase approval return resolved", {
    shop,
    purchaseId,
    shopifyPurchaseId: purchase.shopifyPurchaseId,
    chargeId: options.chargeId ?? null,
    status: status || "unknown",
    attempts,
    settled: Boolean(options.settleApproval),
  });

  if (status === "active") {
    const granted = await grantPurchasedCredits(shop, purchase.id, purchase.credits, purchase.bonusCredits);
    if (granted.bonusCredits > 0) {
      return {
        ok: true,
        message: `${formatCreditCount(granted.totalCredits)} credits added (${formatCreditCount(granted.credits)} purchased + ${formatCreditCount(granted.bonusCredits)} welcome bonus).`,
      };
    }
    return { ok: true, message: `${formatCreditCount(purchase.credits)} credits added to your shop.` };
  }

  await db.creditPurchase.update({
    where: { id: purchase.id },
    data: {
      status: status || "pending",
      lastError: status && status !== "pending" ? `Shopify purchase status: ${status}` : null,
    },
  });

  return {
    ok: false,
    message:
      status === "pending"
        ? "Shopify is still confirming this credit purchase. We will refresh the status automatically."
        : "Credit purchase was not approved.",
  };
}

export async function loadCreditPageData(shop: string) {
  const [credits, recentPurchases, recentLedger, settings] = await Promise.all([
    getCreditOverview(shop),
    db.creditPurchase.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.creditLedgerEntry.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    loadAppSettings(shop),
  ]);
  const replyMultiplier = productDescriptionCreditMultiplier(settings.useProductDescription);
  const modelCosts = Object.fromEntries(
    Object.entries(credits.modelCosts).map(([key, costs]) => [
      key,
      {
        ...costs,
        reply: creditCostForReviewReply(key, { useProductDescription: settings.useProductDescription }),
      },
    ]),
  );

  return {
    credits: {
      ...credits,
      modelCosts,
      useProductDescription: settings.useProductDescription,
      productDescriptionMultiplier: replyMultiplier,
    },
    recentPurchases: recentPurchases.map((purchase) => ({
      id: purchase.id,
      packageId: purchase.packageId,
      credits: purchase.credits,
      bonusCredits: purchase.bonusCredits,
      totalCredits: purchase.totalCredits || purchase.credits + purchase.bonusCredits,
      billingName: purchase.billingName,
      priceLabel: formatCurrency(purchase.amountCents, purchase.currencyCode),
      status: purchase.status,
      createdAt: purchase.createdAt.toISOString(),
    })),
    recentLedger: recentLedger.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      description: entry.description,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export function serializeCreditError(error: unknown) {
  if (error instanceof CreditError) {
    return {
      message: error.message,
      required: error.required,
      balance: error.balance,
      shortfall: error.shortfall,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      details: error.stack,
    };
  }

  return {
    message: "Unknown credit error.",
    details: error,
  };
}
