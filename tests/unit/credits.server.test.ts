import { afterEach, describe, expect, it } from "vitest";
import {
  CreditError,
  CREDIT_PACKAGES,
  creditCostForOperation,
  creditCostForReviewReply,
  creditCostsForModel,
  creditMultiplierForModel,
  productDescriptionCreditMultiplier,
  serializeCreditError,
} from "../../app/credits.server";

const originalProductDescriptionMultiplier = process.env.PRODUCT_DESCRIPTION_CREDIT_MULTIPLIER;

afterEach(() => {
  if (originalProductDescriptionMultiplier === undefined) {
    delete process.env.PRODUCT_DESCRIPTION_CREDIT_MULTIPLIER;
  } else {
    process.env.PRODUCT_DESCRIPTION_CREDIT_MULTIPLIER = originalProductDescriptionMultiplier;
  }
});

describe("credits.server", () => {
  it("offers only the public credit plans shown in Shopify", () => {
    expect(CREDIT_PACKAGES.map((pkg) => pkg.id)).toEqual(["starter", "growth", "scale"]);
  });

  it("maps public credit plans to expected reply capacity", () => {
    const capacityByPackage = Object.fromEntries(
      CREDIT_PACKAGES.map((pkg) => [
        pkg.id,
        {
          basic: Math.floor(pkg.credits / creditCostForReviewReply("basic")),
          pro: Math.floor(pkg.credits / creditCostForReviewReply("pro")),
          premium: Math.floor(pkg.credits / creditCostForReviewReply("premium")),
        },
      ]),
    );

    expect(capacityByPackage).toEqual({
      starter: { basic: 1000, pro: 250, premium: 83 },
      growth: { basic: 3500, pro: 875, premium: 291 },
      scale: { basic: 10000, pro: 2500, premium: 833 },
    });
  });

  it("maps model tiers to credit multipliers", () => {
    expect(creditMultiplierForModel("basic")).toBe(1);
    expect(creditMultiplierForModel("pro")).toBe(4);
    expect(creditMultiplierForModel("premium")).toBe(12);
    expect(creditMultiplierForModel("openai-gpt-5-4-mini")).toBe(4);
    expect(creditMultiplierForModel("gemini-3-flash-preview")).toBe(0);
  });

  it("calculates operation costs by model", () => {
    expect(creditCostForOperation("basic", "reply")).toBe(1);
    expect(creditCostForOperation("pro", "personality")).toBe(8);
    expect(creditCostsForModel("premium")).toMatchObject({
      multiplier: 12,
      reply: 12,
      preview: 12,
      personality: 24,
    });
  });

  it("applies the product description multiplier to reply costs", () => {
    delete process.env.PRODUCT_DESCRIPTION_CREDIT_MULTIPLIER;
    expect(productDescriptionCreditMultiplier(false)).toBe(1);
    expect(productDescriptionCreditMultiplier(true)).toBe(1);
    expect(creditCostForReviewReply("basic", { useProductDescription: true })).toBe(1);
    expect(creditCostForReviewReply("pro", { useProductDescription: true })).toBe(4);
    expect(creditCostForReviewReply("premium", { useProductDescription: true })).toBe(12);
  });

  it("reads the product description multiplier from the environment", () => {
    process.env.PRODUCT_DESCRIPTION_CREDIT_MULTIPLIER = "2.25";

    expect(productDescriptionCreditMultiplier(true)).toBe(2.25);
    expect(creditCostForReviewReply("pro", { useProductDescription: true })).toBe(9);
    expect(creditCostForReviewReply("basic", { useProductDescription: true })).toBe(2.25);
  });

  it("serializes credit errors without losing shortfall details", () => {
    const error = new CreditError("Not enough credits.", { required: 12, balance: 5 });

    expect(serializeCreditError(error)).toMatchObject({
      message: "Not enough credits.",
      required: 12,
      balance: 5,
      shortfall: 7,
    });
  });
});
