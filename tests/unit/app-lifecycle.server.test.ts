import { describe, expect, it } from "vitest";
import {
  LIFECYCLE_INSTALLED,
  LIFECYCLE_UNINSTALLED,
  buildInstallNotificationMessage,
  buildUninstallNotificationMessage,
  shouldSendLifecycleNotification,
} from "../../app/app-lifecycle.server";

describe("app-lifecycle.server", () => {
  it("skips duplicate lifecycle notifications and allows reinstall after uninstall", () => {
    expect(shouldSendLifecycleNotification(null, LIFECYCLE_INSTALLED)).toBe(true);
    expect(shouldSendLifecycleNotification(LIFECYCLE_INSTALLED, LIFECYCLE_INSTALLED)).toBe(false);
    expect(shouldSendLifecycleNotification(LIFECYCLE_UNINSTALLED, LIFECYCLE_INSTALLED)).toBe(true);
    expect(shouldSendLifecycleNotification(LIFECYCLE_UNINSTALLED, LIFECYCLE_UNINSTALLED)).toBe(false);
  });

  it("builds install email copy without leaking access tokens", () => {
    const message = buildInstallNotificationMessage({
      triggeredAt: new Date("2026-06-14T12:00:00.000Z"),
      session: {
        shop: "example.myshopify.com",
        scope: "read_products",
        isOnline: false,
        expires: undefined,
      },
      shopDetails: {
        name: "Example Store",
        email: "store@example.com",
        contactEmail: "contact@example.com",
        myshopifyDomain: "example.myshopify.com",
        ianaTimezone: "America/Argentina/Cordoba",
        primaryDomain: {
          url: "https://example.com",
        },
        plan: {
          publicDisplayName: "Shopify",
          partnerDevelopment: false,
        },
      },
    });

    expect(message).toContain("Installed at: 2026-06-14T12:00:00.000Z");
    expect(message).toContain("Shop name: Example Store");
    expect(message).toContain("Primary domain: https://example.com");
    expect(message).toContain("Granted scopes: read_products");
    expect(message).not.toContain("shpat_");
  });

  it("builds uninstall email copy with Shopify webhook payload details", () => {
    const message = buildUninstallNotificationMessage({
      triggeredAt: new Date("2026-06-14T12:00:00.000Z"),
      topic: "APP_UNINSTALLED",
      shop: "example.myshopify.com",
      payload: {
        id: 123,
        name: "Example Store",
        email: "store@example.com",
        myshopify_domain: "example.myshopify.com",
        plan_name: "basic",
      },
    });

    expect(message).toContain("Uninstalled at: 2026-06-14T12:00:00.000Z");
    expect(message).toContain("Topic: APP_UNINSTALLED");
    expect(message).toContain("Shop ID: 123");
    expect(message).toContain("Raw Shopify webhook payload");
  });
});
