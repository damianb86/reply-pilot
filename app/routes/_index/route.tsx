/* eslint-disable react/no-unescaped-entities */
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  const shouldOpenEmbeddedApp = [
    "shop",
    "host",
    "embedded",
    "id_token",
    "session",
  ].some((param) => url.searchParams.has(param));

  if (shouldOpenEmbeddedApp) {
    const search = url.searchParams.toString();
    return redirect(search ? `/app?${search}` : "/app");
  }

  return null;
};

export default function Index() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Shopify embedded app</p>
          <h1>ReplyPulse AI: Review Replies</h1>
          <p className={styles.lede}>
            AI drafts for Judge.me reviews, trained on the merchant's brand
            voice and approved from a Shopify-native queue.
          </p>
          <p className={styles.lede}>
            Open ReplyPulse AI: Review Replies from Shopify Admin or from the Shopify App Store to
            continue securely.
          </p>
        </div>

        <div className={styles.panel} aria-label="ReplyPulse AI: Review Replies capabilities">
          <div>
            <strong>Review queue</strong>
            <span>Bulk approve, regenerate, or route sensitive reviews to a human.</span>
          </div>
          <div>
            <strong>Brand voice</strong>
            <span>Set personality, sign-off, hard rules, and few-shot examples.</span>
          </div>
          <div>
            <strong>Sent audit</strong>
            <span>Track what shipped as-is and what the team edited.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
