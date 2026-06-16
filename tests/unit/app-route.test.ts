import { describe, expect, it } from "vitest";
import { canAccessBeforeOnboarding } from "../../app/onboarding-access.server";

describe("app route onboarding access", () => {
  it("allows Help and Onboarding before setup is complete", () => {
    expect(canAccessBeforeOnboarding("/app/onboarding")).toBe(true);
    expect(canAccessBeforeOnboarding("/app/help")).toBe(true);
  });

  it("keeps the rest of the app behind onboarding", () => {
    expect(canAccessBeforeOnboarding("/app")).toBe(false);
    expect(canAccessBeforeOnboarding("/app/dashboard")).toBe(false);
    expect(canAccessBeforeOnboarding("/app/reviews")).toBe(false);
    expect(canAccessBeforeOnboarding("/app/settings")).toBe(false);
  });
});
