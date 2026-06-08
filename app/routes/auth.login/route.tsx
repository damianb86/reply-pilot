import { AppProvider } from "@shopify/shopify-app-react-router/react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const { errors } = loaderData;
  const message =
    errors.shop ||
    "Open ReplyPulse AI: Review Replies from Shopify Admin or from the Shopify App Store to continue securely.";

  return (
    <AppProvider embedded={false}>
      <s-page>
        <s-section heading="Log in">
          <div style={{ display: "grid", gap: "12px", maxWidth: "520px" }}>
            <p>{message}</p>
            <p>
              ReplyPulse AI: Review Replies uses Shopify OAuth. Start the flow from Shopify so the
              app receives the verified shop context automatically.
            </p>
          </div>
        </s-section>
      </s-page>
    </AppProvider>
  );
}
