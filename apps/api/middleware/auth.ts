import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";

import type { ApiResponse, AuthUser, UserRole } from "@earnify/shared";

declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
  avatar?: string | null;
};

const jwtSecret = process.env.JWT_SECRET;
const jwtCookieName = process.env.JWT_COOKIE_NAME ?? "earnify_token";

function unauthorized(response: Response) {
  const payload: ApiResponse<never> = {
    success: false,
    error: "Unauthorized",
    code: "UNAUTHORIZED"
  };

  return response.status(401).json(payload);
}

function forbidden(response: Response) {
  const payload: ApiResponse<never> = {
    success: false,
    error: "Forbidden",
    code: "FORBIDDEN"
  };

  return response.status(403).json(payload);
}

function extractToken(request: Request) {
  const header = request.headers.authorization;

  if (header && header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) {
      return token;
    }
  }

  const cookieToken = request.cookies?.[jwtCookieName];
  if (typeof cookieToken === "string" && cookieToken.length > 0) {
    return cookieToken;
  }

  return null;
}

function decodeToken(token: string) {
  if (!jwtSecret) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

    if (!decoded.sub || !decoded.email || !decoded.role || !decoded.name) {
      return null;
    }

    const user: AuthUser = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
      avatar: decoded.avatar ?? null
    };

    return user;
  } catch {
    return null;
  }
}

const requireAuth: RequestHandler = (request: Request, response: Response, next: NextFunction) => {
  const token = extractToken(request);

  if (!token) {
    unauthorized(response);
    return;
  }

  const user = decodeToken(token);
  if (!user) {
    unauthorized(response);
    return;
  }

  request.user = user;
  next();
};

const requireRole = (role: UserRole): RequestHandler => {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.user) {
      unauthorized(response);
      return;
    }

    if (request.user.role !== role) {
      forbidden(response);
      return;
    }

    next();
  };
};

export { requireAuth, requireRole };
