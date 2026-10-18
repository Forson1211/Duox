import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, post } from "../lib/api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("deployed API responses", () => {
  it.each([200, 500, 502])(
    "rejects an HTML response with status %s",
    async (status) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("<!doctype html><html>Platform error</html>", { status }),
      );
      await expect(
        post("/auth/login", {
          email: "player@example.test",
          password: "test-password",
        }),
      ).rejects.toMatchObject({
        name: "Error",
        status: status === 200 ? 503 : status,
        message: expect.stringContaining("temporarily unavailable"),
      });
    },
  );

  it.each(["", "   ", undefined])(
    "uses the same-origin API for an unset or blank base (%s)",
    async (base) => {
      vi.stubEnv("VITE_API_URL", base);
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(JSON.stringify({ user: { id: "player" } })),
        );
      await api("/auth/me");
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/auth/me",
        expect.objectContaining({ credentials: "include", cache: "no-store" }),
      );
    },
  );

  it("normalizes trailing slashes and preserves useful validation errors", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1/");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Invalid email or password." }), {
          status: 401,
        }),
      );
    await expect(post("/auth/login")).rejects.toBeInstanceOf(ApiError);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/auth/login",
      expect.any(Object),
    );
  });
});
