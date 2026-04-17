import type { Response } from "express";

import type { ApiResponse } from "@earnify/shared";

export function sendSuccess<T>(response: Response, data: T, status = 200) {
  const payload: ApiResponse<T> = {
    success: true,
    data
  };

  return response.status(status).json(payload);
}

export function sendError(response: Response, error: string, status = 400) {
  const payload: ApiResponse<never> = {
    success: false,
    error
  };

  return response.status(status).json(payload);
}
