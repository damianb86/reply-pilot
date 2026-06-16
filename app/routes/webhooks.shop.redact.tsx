import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { authenticateWebhook } from "../webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticateWebhook(request);
  const shopDomain =
    typeof payload === "object" &&
    payload !== null &&
    "shop_domain" in payload &&
    typeof payload.shop_domain === "string"
      ? payload.shop_domain
      : shop;

  console.log(`Received ${topic} webhook for ${shopDomain}`);

  await Promise.all([
    db.reviewDraft.deleteMany({ where: { shop: shopDomain } }),
    db.brandVoiceSetting.deleteMany({ where: { shop: shopDomain } }),
    db.judgeMeConnection.deleteMany({ where: { shop: shopDomain } }),
    db.yotpoConnection.deleteMany({ where: { shop: shopDomain } }),
    db.appSetting.deleteMany({ where: { shop: shopDomain } }),
    db.creditLedgerEntry.deleteMany({ where: { shop: shopDomain } }),
    db.creditPurchase.deleteMany({ where: { shop: shopDomain } }),
    db.creditAccount.deleteMany({ where: { shop: shopDomain } }),
    db.contactRequest.deleteMany({ where: { shop: shopDomain } }),
    db.session.deleteMany({ where: { shop: shopDomain } }),
  ]);

  return new Response();
};
