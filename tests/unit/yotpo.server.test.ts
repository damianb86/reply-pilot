import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildYotpoSnapshot,
  commentOnYotpoReview,
  generateYotpoAccessToken,
  maskYotpoSecret,
  serializeYotpoError,
  YotpoApiError,
} from "../../app/yotpo.server";

describe("yotpo.server", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("masks Yotpo API secrets for UI and logs", () => {
    expect(maskYotpoSecret("short")).toBe("••••");
    expect(maskYotpoSecret("abcd1234567890")).toBe("abcd••••7890");
  });

  it("generates an access token from Store ID and API secret", async () => {
    const fetchMock = vi.fn(async () => (
      new Response(JSON.stringify({ access_token: "token-123", token_type: "bearer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ));
    vi.stubGlobal("fetch", fetchMock);

    const token = await generateYotpoAccessToken("store-123", "secret-123");

    expect(token).toEqual({ accessToken: "token-123", tokenType: "bearer" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.yotpo.com/oauth/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          client_id: "store-123",
          client_secret: "secret-123",
          grant_type: "client_credentials",
        }),
      }),
    );
  });

  it("validates credentials by loading a small reviews sample", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token-123", token_type: "bearer" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          reviews: [
            { id: 1, content: "Great fit", score: 5 },
            { id: 2, content: "Good quality", score: 4 },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await buildYotpoSnapshot("store-123", "secret-123");

    expect(snapshot).toMatchObject({
      storeId: "store-123",
      tokenType: "bearer",
      reviewCount: 2,
      sampleReviews: [
        { id: 1, content: "Great fit", score: 5 },
        { id: 2, content: "Good quality", score: 4 },
      ],
    });
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://api.yotpo.com/v1/apps/store-123/reviews?count=5&page=1&deleted=false",
    );
  });

  it("creates public comments on Yotpo reviews with the core API utoken", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => (
      new Response(JSON.stringify({ id: "comment-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ));
    vi.stubGlobal("fetch", fetchMock);

    await commentOnYotpoReview({
      storeId: "store-123",
      accessToken: "token-123",
      reviewId: "review-456",
      content: "Thanks for the review.",
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.yotpo.com/reviews/review-456/comments",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          utoken: "token-123",
          comment: {
            content: "Thanks for the review.",
            public: true,
          },
        }),
      }),
    );
  });

  it("turns invalid client responses into a merchant-friendly error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => (
      new Response(JSON.stringify({ error: "invalid_client" }), {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json" },
      })
    )));

    await expect(generateYotpoAccessToken("store-123", "bad-secret")).rejects.toMatchObject({
      message: "Yotpo rejected the Store ID or API secret.",
      status: 400,
      statusText: "Bad Request",
    });
  });

  it("serializes Yotpo API errors", () => {
    const error = new YotpoApiError("Yotpo failed", {
      status: 401,
      statusText: "Unauthorized",
      details: { error: "bad token" },
    });

    expect(serializeYotpoError(error)).toMatchObject({
      message: "Yotpo failed",
      status: 401,
      statusText: "Unauthorized",
      details: { error: "bad token" },
      providerName: "Yotpo",
    });
  });
});
