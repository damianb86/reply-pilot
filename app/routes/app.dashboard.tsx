import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import DashboardPage from "../../src/pages/DashboardPage";
import {
  buildJudgeMeSnapshot,
  isJudgeMeTestDomainFieldEnabled,
  upsertJudgeMeConnection,
} from "../judgeme.server";
import {
  clearOtherReviewSources,
  disconnectReviewSource,
  getReviewSourceConnectionView,
  refreshReviewSourceConnection,
  serializeReviewSourceError,
} from "../review-source.server";
import { authenticate } from "../shopify.server";
import { testYotpoConnection, upsertYotpoConnection } from "../yotpo.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const appEnv = process.env.APP_ENV || process.env.NODE_ENV || "development";

  return {
    shop: session.shop,
    appHandle: process.env.SHOPIFY_APP_HANDLE || "reply-pilot",
    connection: await getReviewSourceConnectionView(session.shop),
    judgeMeApiSettingsUrl: "https://judge.me/settings?jump_to=judge.me+api",
    judgeMeApiDocsUrl: "https://judge.me/help/en/articles/8409180-judge-me-api",
    yotpoApiCredentialsUrl: "https://app.yotpo.com/account_settings/general",
    yotpoCredentialGuideUrl: "https://support.yotpo.com/docs/finding-your-yotpo-app-key-and-secret-key-3",
    yotpoApiCredentialsDocsUrl: "https://apidocs.yotpo.com/reference/finding-your-app-key-and-api-secret",
    yotpoAuthenticationDocsUrl: "https://apidocs.yotpo.com/reference/yotpo-authentication",
    isDevelopment: appEnv !== "production",
    showJudgeMeTestDomainField: isJudgeMeTestDomainFieldEnabled(),
    appEnv,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "test-connection" || intent === "connect-token") {
    const provider = String(formData.get("provider") ?? "judgeme") === "yotpo" ? "yotpo" : "judgeme";

    if (provider === "yotpo") {
      const storeId = String(formData.get("storeId") ?? "").trim();
      const apiSecret = String(formData.get("apiSecret") ?? "").trim();

      if (!storeId || !apiSecret) {
        return {
          ok: false,
          intent,
          provider,
          providerName: "Yotpo",
          message: "Yotpo Store ID and API secret are required.",
          connection: await getReviewSourceConnectionView(session.shop),
        };
      }

      try {
        if (intent === "test-connection") {
          await testYotpoConnection({ storeId, apiSecret });

          return {
            ok: true,
            intent,
            provider,
            providerName: "Yotpo",
            message: "Yotpo connection tested successfully.",
            connection: await getReviewSourceConnectionView(session.shop),
          };
        }

        await upsertYotpoConnection({
          shop: session.shop,
          storeId,
          apiSecret,
          authMethod: "store_id_api_secret",
        });

        return {
          ok: true,
          intent,
          provider,
          providerName: "Yotpo",
          message: "Yotpo connected successfully.",
          connection: await getReviewSourceConnectionView(session.shop),
        };
      } catch (error) {
        const serialized = serializeReviewSourceError(error, provider);
        return {
          ok: false,
          intent,
          provider,
          providerName: "Yotpo",
          message: serialized.message,
          error: serialized,
          connection: await getReviewSourceConnectionView(session.shop),
        };
      }
    }

    const apiToken = String(formData.get("apiToken") ?? "").trim();
    const submittedShopDomain = String(formData.get("shopDomain") ?? "").trim();
    const shopDomain =
      isJudgeMeTestDomainFieldEnabled() && submittedShopDomain
        ? submittedShopDomain
        : session.shop;

    if (!apiToken) {
      return {
        ok: false,
        intent,
        provider,
        providerName: "Judge.me",
        message: "Judge.me private API token is required.",
        connection: await getReviewSourceConnectionView(session.shop),
      };
    }

    try {
      if (intent === "test-connection") {
        await buildJudgeMeSnapshot(apiToken, shopDomain);

        return {
          ok: true,
          intent,
          provider,
          providerName: "Judge.me",
          message: "Judge.me connection tested successfully.",
          connection: await getReviewSourceConnectionView(session.shop),
        };
      }

      await upsertJudgeMeConnection({
        shop: session.shop,
        shopDomain,
        apiToken,
        authMethod: "private_token",
      });
      await clearOtherReviewSources(session.shop, "judgeme");

      return {
        ok: true,
        intent,
        provider,
        providerName: "Judge.me",
        message: "Judge.me connected successfully.",
        connection: await getReviewSourceConnectionView(session.shop),
      };
    } catch (error) {
      const serialized = serializeReviewSourceError(error, provider);
      return {
        ok: false,
        intent,
        provider,
        providerName: "Judge.me",
        message: serialized.message,
        error: serialized,
        connection: await getReviewSourceConnectionView(session.shop),
      };
    }
  }

  if (intent === "refresh") {
    const connection = await getReviewSourceConnectionView(session.shop);

    try {
      await refreshReviewSourceConnection(session.shop);

      return {
        ok: true,
        intent,
        provider: connection?.provider,
        providerName: connection?.providerName || "Review source",
        message: `${connection?.providerName || "Review source"} connection refreshed.`,
        connection: await getReviewSourceConnectionView(session.shop),
      };
    } catch (error) {
      const serialized = serializeReviewSourceError(error, connection?.provider);
      return {
        ok: false,
        intent,
        provider: connection?.provider,
        providerName: connection?.providerName || "Review source",
        message: serialized.message,
        error: serialized,
        connection: await getReviewSourceConnectionView(session.shop),
      };
    }
  }

  if (intent === "disconnect") {
    await disconnectReviewSource(session.shop);
    return {
      ok: true,
      intent,
      message: "Review source disconnected.",
      connection: null,
    };
  }

  return {
    ok: false,
    intent,
    message: "Unknown Connect action.",
  };
}

export default function DashboardRoute() {
  return <DashboardPage />;
}
