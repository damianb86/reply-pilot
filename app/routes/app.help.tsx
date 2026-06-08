import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sendContactEmail } from "../email.server";
import HelpPage from "../../src/pages/HelpPage";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  return {
    contactEmail: process.env.CONTACT_EMAIL || null,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "contact");

  if (intent === "privacy-data-request") {
    try {
      const [
        reviews,
        brandVoice,
        judgeMeConnections,
        appSettings,
        creditAccounts,
        creditLedgerEntries,
        creditPurchases,
        contacts,
      ] = await Promise.all([
        db.reviewDraft.count({ where: { shop: session.shop } }),
        db.brandVoiceSetting.count({ where: { shop: session.shop } }),
        db.judgeMeConnection.count({ where: { shop: session.shop } }),
        db.appSetting.count({ where: { shop: session.shop } }),
        db.creditAccount.count({ where: { shop: session.shop } }),
        db.creditLedgerEntry.count({ where: { shop: session.shop } }),
        db.creditPurchase.count({ where: { shop: session.shop } }),
        db.contactRequest.count({ where: { shop: session.shop } }),
      ]);

      await sendContactEmail({
        type: "Privacy: Data summary",
        subject: "Privacy - Data summary requested",
        shop: session.shop,
        message: [
          `Shop: ${session.shop}`,
          "",
          "Data currently stored for this shop:",
          `- Review records and AI drafts: ${reviews}`,
          `- Brand Voice settings: ${brandVoice}`,
          `- Judge.me connections: ${judgeMeConnections}`,
          `- App settings: ${appSettings}`,
          `- Credit accounts: ${creditAccounts}`,
          `- Credit ledger entries: ${creditLedgerEntries}`,
          `- Credit purchases: ${creditPurchases}`,
          `- Contact requests: ${contacts}`,
          "- Sessions: active Shopify admin authentication tokens",
        ].join("\n"),
      });

      return {
        ok: true,
        intent,
        counts: {
          reviews,
          brandVoice,
          judgeMeConnections,
          appSettings,
          creditAccounts,
          creditLedgerEntries,
          creditPurchases,
          contacts,
        },
        message: "Data summary sent to our team. We will respond within 30 days.",
      };
    } catch (error) {
      console.error("[app.help.privacy-data-request]", error);
      return {
        ok: false,
        intent,
        message: "Could not request the data summary. Check SMTP configuration and try again.",
      };
    }
  }

  if (intent === "privacy-data-delete") {
    try {
      await Promise.all([
        db.reviewDraft.deleteMany({ where: { shop: session.shop } }),
        db.brandVoiceSetting.deleteMany({ where: { shop: session.shop } }),
        db.judgeMeConnection.deleteMany({ where: { shop: session.shop } }),
        db.appSetting.deleteMany({ where: { shop: session.shop } }),
        db.creditLedgerEntry.deleteMany({ where: { shop: session.shop } }),
        db.creditPurchase.deleteMany({ where: { shop: session.shop } }),
        db.creditAccount.deleteMany({ where: { shop: session.shop } }),
        db.contactRequest.deleteMany({ where: { shop: session.shop } }),
        db.session.deleteMany({ where: { shop: session.shop } }),
      ]);

      await sendContactEmail({
        type: "Privacy: Data deleted",
        subject: "Privacy - Merchant deleted all app data",
        shop: session.shop,
        message: [
          `Shop: ${session.shop}`,
          "",
          "The merchant requested deletion of all ReplyPulse AI: Review Replies app data.",
          "Deleted: review records, AI drafts, Brand Voice settings, Judge.me connection, app settings, credit records, contact requests, and Shopify sessions.",
        ].join("\n"),
      });

      return {
        ok: true,
        intent,
        message: "All ReplyPulse AI: Review Replies app data has been permanently deleted.",
      };
    } catch (error) {
      console.error("[app.help.privacy-data-delete]", error);
      return {
        ok: false,
        intent,
        message: "Could not delete the app data. Check logs and try again.",
      };
    }
  }

  const type = String(formData.get("type") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const replyEmail = String(formData.get("email") ?? "").trim() || undefined;

  if (!type || !message) {
    return {
      ok: false,
      intent: "contact" as const,
      message: "Message is required.",
    };
  }

  try {
    await db.contactRequest.create({
      data: {
        shop: session.shop,
        type,
        subject: subject || type,
        message,
        email: replyEmail ?? null,
      },
    });

    await sendContactEmail({
      type,
      subject: subject || type,
      message,
      replyEmail,
      shop: session.shop,
    });

    return {
      ok: true,
      intent: "contact" as const,
      message: "Message sent. We will get back to you soon.",
    };
  } catch (error) {
    console.error("[app.help.action]", error);
    return {
      ok: false,
      intent: "contact" as const,
      message: "Could not send the message. Check SMTP configuration and try again.",
    };
  }
}

export default function HelpRoute() {
  return <HelpPage />;
}
