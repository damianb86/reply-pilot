import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import OnboardingPage from "../../src/pages/OnboardingPage";
import { loadBrandVoicePageData, saveBrandVoiceSettings } from "../brand-voice.server";
import { productDescriptionCreditMultiplier } from "../credits.server";
import db from "../db.server";
import { isJudgeMeTestDomainFieldEnabled } from "../judgeme.server";
import { getReviewSourceConnectionView } from "../review-source.server";
import { loadAppSettings, saveAppSettings } from "../settings.server";
import { authenticate } from "../shopify.server";
import { loadShopifyProducts } from "../shopify-products.server";
import { resolveAiModelId } from "../ai.server";

const DEFAULT_ONBOARDING_REVIEW =
  "I bought this a few weeks ago and it has been really useful so far. The quality feels good, setup was simple, and it fits what I needed. I would love to see how you would respond to a normal customer review like this.";

function redirectWithEmbeddedParams(request: Request, pathname: string) {
  const url = new URL(request.url);
  const nextUrl = new URL(pathname, url.origin);
  for (const key of ["embedded", "host", "shop"]) {
    const value = url.searchParams.get(key);
    if (value) nextUrl.searchParams.set(key, value);
  }
  return redirect(`${nextUrl.pathname}${nextUrl.search}`);
}

function parseStringList(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const data = JSON.parse(value) as unknown;
    if (!Array.isArray(data)) return [];

    const seen = new Set<string>();
    return data
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => {
        const key = item.toLowerCase();
        if (!item || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 30);
  } catch {
    return [];
  }
}

function booleanValue(value: FormDataEntryValue | null) {
  return value === "true" || value === "on" || value === "1";
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const appEnv = process.env.APP_ENV || process.env.NODE_ENV || "development";
  const [settings, brandVoice, connection, existingBrandVoice, products] = await Promise.all([
    loadAppSettings(session.shop),
    loadBrandVoicePageData(session.shop),
    getReviewSourceConnectionView(session.shop),
    db.brandVoiceSetting.findUnique({
      where: { shop: session.shop },
      select: { selectedModel: true, personality: true, previewProductId: true },
    }),
    loadShopifyProducts(admin, 1).catch(() => []),
  ]);
  const firstProduct = products[0] ?? null;
  const hasSavedBrandVoice = Boolean(existingBrandVoice?.personality?.trim());
  const hasSavedPreviewProduct = Boolean(existingBrandVoice?.previewProductId);

  return {
    shop: session.shop,
    appHandle: process.env.SHOPIFY_APP_HANDLE || "reply-pilot",
    settings,
    connection,
    judgeMeApiSettingsUrl: "https://judge.me/settings?jump_to=judge.me+api",
    judgeMeApiDocsUrl: "https://judge.me/help/en/articles/8409180-judge-me-api",
    yotpoApiCredentialsUrl: "https://app.yotpo.com/account_settings/general",
    yotpoCredentialGuideUrl: "https://support.yotpo.com/docs/finding-your-yotpo-app-key-and-secret-key-3",
    yotpoApiCredentialsDocsUrl: "https://apidocs.yotpo.com/reference/finding-your-app-key-and-api-secret",
    yotpoAuthenticationDocsUrl: "https://apidocs.yotpo.com/reference/yotpo-authentication",
    isDevelopment: appEnv !== "production",
    showJudgeMeTestDomainField: isJudgeMeTestDomainFieldEnabled(),
    appEnv,
    brandVoice: {
      ...brandVoice,
      settings: {
        ...brandVoice.settings,
        persona: hasSavedBrandVoice ? brandVoice.settings.persona : "",
        selectedModel: resolveAiModelId(existingBrandVoice?.selectedModel || "pro"),
        livePreview: "",
        previewReview: hasSavedBrandVoice ? brandVoice.settings.previewReview : DEFAULT_ONBOARDING_REVIEW,
        previewRating: hasSavedBrandVoice ? brandVoice.settings.previewRating : 4,
        previewProductId: hasSavedPreviewProduct ? brandVoice.settings.previewProductId : firstProduct?.id ?? "",
        previewProductTitle: hasSavedPreviewProduct
          ? brandVoice.settings.previewProductTitle
          : firstProduct?.title ?? "Sample product",
        previewProductType: hasSavedPreviewProduct
          ? brandVoice.settings.previewProductType
          : firstProduct?.productType ?? "Product",
        previewProductTags: hasSavedPreviewProduct
          ? brandVoice.settings.previewProductTags
          : firstProduct?.tags ?? [],
      },
    },
    productDescriptionCreditMultiplier: productDescriptionCreditMultiplier(true),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent !== "complete-onboarding") {
    return {
      ok: false,
      intent,
      message: "Unknown onboarding action.",
    };
  }

  const personality = String(formData.get("personality") ?? "").trim();
  if (!personality) {
    return {
      ok: false,
      intent,
      message: "Add Personality text before finishing setup.",
    };
  }

  await saveBrandVoiceSettings(session.shop, {
    personality,
    greeting: String(formData.get("greeting") ?? ""),
    signOff: String(formData.get("signOff") ?? ""),
    alwaysMention: parseStringList(formData.get("alwaysMention")),
    avoidPhrases: parseStringList(formData.get("avoidPhrases")),
    selectedModel: String(formData.get("modelId") ?? "pro"),
    livePreview: String(formData.get("livePreview") ?? ""),
    previewReview: String(formData.get("previewReview") ?? ""),
    previewProductId: String(formData.get("previewProductId") ?? ""),
    previewProductTitle: String(formData.get("previewProductTitle") ?? ""),
    previewProductType: String(formData.get("previewProductType") ?? ""),
    previewProductTags: parseStringList(formData.get("previewProductTags")),
    previewRating: Number(formData.get("previewRating") ?? 4),
    personalityStyle: String(formData.get("personalityStyle") ?? ""),
    personalityStrength: String(formData.get("personalityStrength") ?? ""),
    replyLength: String(formData.get("replyLength") ?? ""),
  });

  const currentSettings = await loadAppSettings(session.shop);
  await saveAppSettings(session.shop, {
    ...currentSettings,
    useProductDescription: booleanValue(formData.get("useProductDescription")),
    onboardingCompleted: true,
  });

  return redirectWithEmbeddedParams(request, "/app/reviews");
}

export default function OnboardingRoute() {
  return <OnboardingPage />;
}
