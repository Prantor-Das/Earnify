import type { CookieOptions, Request } from "express";

type CookieSameSite = "lax" | "strict" | "none";

function parseCookieSameSite(value: string | undefined): CookieSameSite | null {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === "strict" ||
    normalized === "none" ||
    normalized === "lax"
  ) {
    return normalized;
  }

  return null;
}

function parseCookieSecure(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return fallback;
}

function getWebAuthSuccessRedirect() {
  if (process.env.WEB_AUTH_SUCCESS_REDIRECT) {
    return process.env.WEB_AUTH_SUCCESS_REDIRECT;
  }

  if (!process.env.WEB_ORIGIN) {
    return undefined;
  }

  try {
    return new URL("/dashboard", process.env.WEB_ORIGIN).toString();
  } catch {
    return undefined;
  }
}

function getRequestOrigin(request: Request) {
  const forwardedProto = request
    .header("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol = forwardedProto || request.protocol;
  const host = request.get("host");

  return host ? `${protocol}://${host}` : null;
}

function hasLocalHostname(url: URL) {
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1"
  );
}

function inferCookieSameSite(
  request: Request,
  webAuthSuccessRedirect = getWebAuthSuccessRedirect(),
): CookieSameSite {
  const configuredSameSite = parseCookieSameSite(
    process.env.AUTH_COOKIE_SAME_SITE,
  );
  if (configuredSameSite) {
    return configuredSameSite;
  }

  if (!webAuthSuccessRedirect) {
    return "lax";
  }

  const requestOrigin = getRequestOrigin(request);
  if (!requestOrigin) {
    return "lax";
  }

  try {
    const apiUrl = new URL(requestOrigin);
    const webUrl = new URL(webAuthSuccessRedirect);

    if (hasLocalHostname(apiUrl) && hasLocalHostname(webUrl)) {
      return "lax";
    }

    return apiUrl.hostname === webUrl.hostname ? "lax" : "none";
  } catch {
    return "lax";
  }
}

function getCookieOptions(request: Request): CookieOptions {
  const sameSite = inferCookieSameSite(request);
  const requestIsHttps =
    request.secure ||
    request.header("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  const secure = parseCookieSecure(
    process.env.AUTH_COOKIE_SECURE,
    sameSite === "none" ||
      process.env.NODE_ENV === "production" ||
      requestIsHttps,
  );

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
  };
}

export {
  getCookieOptions,
  getWebAuthSuccessRedirect,
  inferCookieSameSite,
  parseCookieSecure,
};
