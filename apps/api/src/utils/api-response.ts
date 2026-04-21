import type { Response } from "express";

import type { ApiResponse } from "@earnify/shared";

function defaultCodeForStatus(status: number) {
  if (status === 400) {
    return "BAD_REQUEST";
  }

  if (status === 401) {
    return "UNAUTHORIZED";
  }

  if (status === 403) {
    return "FORBIDDEN";
  }

  if (status === 404) {
    return "NOT_FOUND";
  }

  if (status >= 500) {
    return "INTERNAL_ERROR";
  }

  return "ERROR";
}

export function sendSuccess<T>(response: Response, data: T, status = 200) {
  const payload: ApiResponse<T> = {
    success: true,
    data
  };

  return response.status(status).json(payload);
}

export function sendError(response: Response, error: string, status = 400, code?: string) {
  const payload: ApiResponse<never> = {
    success: false,
    error,
    code: code ?? defaultCodeForStatus(status)
  };

  return response.status(status).json(payload);
}
