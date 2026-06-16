import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData, useLocation, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

import { authenticate } from "../shopify.server";
import IguShell from "../components/IguShell";
import PageLoadingState from "../../src/PageLoadingState";
import { getCreditOverview } from "../credits.server";
import { loadAppSettings } from "../settings.server";
import { canAccessBeforeOnboarding } from "../onboarding-access.server";

function pathWithEmbeddedParams(url: URL, pathname: string) {
  const nextUrl = new URL(pathname, url.origin);
  for (const key of ["embedded", "host", "shop"]) {
    const value = url.searchParams.get(key);
    if (value) nextUrl.searchParams.set(key, value);
  }
  return `${nextUrl.pathname}${nextUrl.search}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const settings = await loadAppSettings(session.shop);

  if (!settings.onboardingCompleted && !canAccessBeforeOnboarding(url.pathname)) {
    return redirect(pathWithEmbeddedParams(url, "/app/onboarding"));
  }

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    credits: await getCreditOverview(session.shop),
    onboardingCompleted: settings.onboardingCompleted,
  };
};

function loadingCopyForPath(pathname: string) {
  if (pathname.endsWith("/reviews")) {
    return {
      title: "Loading Reviews",
      description: "Preparing reviews, filters, AI state, and connection status...",
    };
  }

  if (pathname.endsWith("/logs")) {
    return {
      title: "Loading Sent",
      description: "Preparing sent replies, filters, metrics, and audit details...",
    };
  }

  if (pathname.endsWith("/settings")) {
    return {
      title: "Loading Settings",
      description: "Preparing saved preferences, queue behavior, and Brand Voice...",
    };
  }

  if (pathname.endsWith("/credits")) {
    return {
      title: "Loading Credits",
      description: "Preparing balance, purchase packages, and recent credit activity...",
    };
  }

  if (pathname.endsWith("/onboarding")) {
    return {
      title: "Loading Setup",
      description: "Preparing your first ReplyPulse setup steps...",
    };
  }

  if (pathname.endsWith("/help")) {
    return {
      title: "Loading Help",
      description: "Preparing guides, resources, and support options...",
    };
  }

  return {
    title: "Loading Connect",
    description: "Preparing connection status and integration details...",
  };
}

export default function App() {
  const { apiKey, credits } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigation = useNavigation();
  const params = new URLSearchParams(location.search);
  const embeddedParams = new URLSearchParams();

  for (const key of ["embedded", "host", "shop"]) {
    const value = params.get(key);
    if (value) {
      embeddedParams.set(key, value);
    }
  }

  const embeddedSearch = embeddedParams.toString();
  const withEmbeddedSearch = (path: string) =>
    embeddedSearch ? `${path}?${embeddedSearch}` : path;
  const targetPath = navigation.location?.pathname ?? "";
  const isRouteLoading =
    navigation.state === "loading" &&
    Boolean(targetPath) &&
    targetPath !== location.pathname;
  const loadingCopy = loadingCopyForPath(targetPath);

  return (
    <ShopifyAppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        <NavMenu>
          <a href={withEmbeddedSearch("/app")} rel="home">Reply Pulse AI: Review Replies</a>
          <a href={withEmbeddedSearch("/app/dashboard")}>Connect</a>
          <a href={withEmbeddedSearch("/app/reviews")}>Reviews</a>
          <a href={withEmbeddedSearch("/app/logs")}>Sent</a>
          <a href={withEmbeddedSearch("/app/settings")}>Settings</a>
          <a href={withEmbeddedSearch("/app/help")}>Help</a>
        </NavMenu>
        <IguShell credits={credits} hideCredits={location.pathname.endsWith("/onboarding")}>
          {isRouteLoading ? (
            <PageLoadingState title={loadingCopy.title} description={loadingCopy.description} />
          ) : (
            <Outlet />
          )}
        </IguShell>
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
