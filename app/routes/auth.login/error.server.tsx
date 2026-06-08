import type { LoginError } from "@shopify/shopify-app-react-router/server";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";

interface LoginErrorMessage {
  shop?: string;
}

export function loginErrorMessage(loginErrors: LoginError): LoginErrorMessage {
  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return {
      shop: "Open ReplyPulse AI: Review Replies from Shopify Admin or from the Shopify App Store to continue.",
    };
  } else if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return {
      shop: "The Shopify shop context was invalid. Reopen ReplyPulse AI: Review Replies from Shopify Admin to continue.",
    };
  }

  return {};
}
