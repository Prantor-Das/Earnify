import type { ErrorRequestHandler, RequestHandler } from "express";

import { sendError } from "../utils/api-response.ts";

const notFoundHandler: RequestHandler = (request, response) => {
  sendError(
    response,
    `Route ${request.method} ${request.originalUrl} not found`,
    404,
    "ROUTE_NOT_FOUND",
  );
};

const globalErrorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  _next,
) => {
  const status =
    typeof (error as { status?: unknown })?.status === "number"
      ? (error as { status: number }).status
      : 500;
  const code =
    typeof (error as { code?: unknown })?.code === "string"
      ? (error as { code: string }).code
      : "INTERNAL_ERROR";
  const message =
    error instanceof Error ? error.message : "Unexpected server error";

  console.error("Unhandled API error", {
    method: request.method,
    path: request.originalUrl,
    ip: request.ip,
    userId: request.user?.id ?? null,
    query: request.query,
    body: request.body,
    code,
    status,
    message,
    stack:
      process.env.NODE_ENV === "production"
        ? undefined
        : error instanceof Error
          ? error.stack
          : undefined,
  });

  sendError(
    response,
    status >= 500 ? "Internal server error" : message,
    status,
    code,
  );
};

export { globalErrorHandler, notFoundHandler };
