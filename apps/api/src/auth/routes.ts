import { Router } from "express";
import jwt from "jsonwebtoken";
import passport from "passport";
import type { SignOptions } from "jsonwebtoken";

import type { AuthUser } from "@earnify/shared";

import { requireAuth } from "../../middleware/auth";
import { sendError, sendSuccess } from "../utils/api-response";

const authRouter = Router();

const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "7d";
const jwtCookieName = process.env.JWT_COOKIE_NAME ?? "earnify_token";
const webAuthSuccessRedirect = process.env.WEB_AUTH_SUCCESS_REDIRECT;

function issueJwt(user: AuthUser) {
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }

  const signOptions: SignOptions = {
    expiresIn: jwtExpiresIn as SignOptions["expiresIn"]
  };

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      avatar: user.avatar ?? null
    },
    jwtSecret,
    signOptions
  );
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/"
  };
}

authRouter.post("/google", (request, response, next) => {
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false
  })(request, response, next);
});

authRouter.get("/google/callback", (request, response, next) => {
  passport.authenticate("google", { session: false }, (error: unknown, user: Express.User | false) => {
    if (error) {
      sendError(response, "Google authentication failed", 401);
      return;
    }

    if (!user) {
      sendError(response, "Unable to authenticate user", 401);
      return;
    }

    try {
      const authUser = user as AuthUser;
      const token = issueJwt(authUser);

      response.cookie(jwtCookieName, token, getCookieOptions());

      if (webAuthSuccessRedirect) {
        response.redirect(webAuthSuccessRedirect);
        return;
      }

      sendSuccess(response, {
        token,
        user: authUser
      });
    } catch {
      sendError(response, "Failed to issue auth token", 500);
    }
  })(request, response, next);
});

authRouter.get("/me", requireAuth, (request, response) => {
  sendSuccess(response, {
    user: request.user as AuthUser
  });
});

authRouter.post("/logout", (request, response) => {
  response.clearCookie(jwtCookieName, getCookieOptions());

  if (typeof request.logout === "function") {
    request.logout(() => {
      sendSuccess(response, { message: "Logged out" });
    });
    return;
  }

  sendSuccess(response, { message: "Logged out" });
});

export { authRouter };
