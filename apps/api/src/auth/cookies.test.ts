import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Request } from "express";

import {
  getCookieOptions,
  getWebAuthSuccessRedirect,
  inferCookieSameSite,
  parseCookieSecure,
} from "./cookies.ts";

const ENV_KEYS = [
  "AUTH_COOKIE_SAME_SITE",
  "AUTH_COOKIE_SECURE",
  "NODE_ENV",
  "WEB_AUTH_SUCCESS_REDIRECT",
  "WEB_ORIGIN",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

function makeRequest({
  host = "localhost:4000",
  protocol = "http",
  secure = false,
  forwardedProto,
}: {
  host?: string;
  protocol?: string;
  secure?: boolean;
  forwardedProto?: string;
} = {}) {
  return {
    protocol,
    secure,
    get(name: string) {
      return name.toLowerCase() === "host" ? host : undefined;
    },
    header(name: string) {
      return name.toLowerCase() === "x-forwarded-proto"
        ? forwardedProto
        : undefined;
    },
  } as Request;
}

describe("auth cookie helpers", () => {
  const originalEnv: Partial<Record<EnvKey, string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("keeps localhost frontend/API cookies on lax SameSite", () => {
    const sameSite = inferCookieSameSite(
      makeRequest(),
      "http://localhost:3000/dashboard",
    );

    expect(sameSite).toBe("lax");
  });

  it("uses SameSite none for deployed frontend and API on different hosts", () => {
    const sameSite = inferCookieSameSite(
      makeRequest({
        host: "earnify-api.onrender.com",
        protocol: "https",
        secure: true,
      }),
      "https://earnify-web.vercel.app/dashboard",
    );

    expect(sameSite).toBe("none");
  });

  it("respects explicit SameSite config when provided", () => {
    process.env.AUTH_COOKIE_SAME_SITE = "strict";

    const sameSite = inferCookieSameSite(
      makeRequest({
        host: "earnify-api.onrender.com",
        protocol: "https",
        secure: true,
      }),
      "https://earnify-web.vercel.app/dashboard",
    );

    expect(sameSite).toBe("strict");
  });

  it("falls back to the inferred secure value for blank AUTH_COOKIE_SECURE", () => {
    expect(parseCookieSecure("", true)).toBe(true);
    expect(parseCookieSecure("", false)).toBe(false);
  });

  it("marks cross-site production cookies secure", () => {
    process.env.WEB_AUTH_SUCCESS_REDIRECT =
      "https://earnify-web.vercel.app/dashboard";

    const options = getCookieOptions(
      makeRequest({
        host: "earnify-api.onrender.com",
        protocol: "https",
        forwardedProto: "https",
      }),
    );

    expect(options).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: true,
    });
  });

  it("builds a dashboard redirect from WEB_ORIGIN when no explicit redirect is set", () => {
    process.env.WEB_ORIGIN = "https://earnify-web.vercel.app";

    expect(getWebAuthSuccessRedirect()).toBe(
      "https://earnify-web.vercel.app/dashboard",
    );
  });
});
