import type { ActionFunctionArgs } from "react-router";
import { notifyAppUninstalled } from "../app-lifecycle.server";
import db from "../db.server";
import { authenticateWebhook } from "../webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticateWebhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    await notifyAppUninstalled({ payload, shop, topic });
  } catch (error) {
    console.error("[webhooks.app.uninstalled.notification]", error);
  }

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
