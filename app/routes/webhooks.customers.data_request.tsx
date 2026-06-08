import type { ActionFunctionArgs } from "react-router";
import { sendContactEmail } from "../email.server";
import { authenticateWebhook } from "../webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticateWebhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    await sendContactEmail({
      type: "Privacy webhook: customers/data_request",
      subject: "Customer data request received",
      shop,
      message: [
        `Shop: ${shop}`,
        "",
        "Shopify sent a customers/data_request privacy webhook.",
        "Reply Pulse AI: Review Replies stores merchant configuration, contact requests, app sessions, and review-reply workflow data only if the merchant connects those features.",
        "Review the request in Shopify Partner Dashboard if customer-specific export is required.",
        "",
        JSON.stringify(payload, null, 2),
      ].join("\n"),
    });
  } catch (error) {
    console.error("[webhooks.customers.data_request]", error);
  }

  return new Response();
};
