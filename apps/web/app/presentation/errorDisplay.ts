import {
  extractSerializedError,
  type SerializedError,
} from "@/presentation/errorResponse";
import { classifySerializedError } from "@/presentation/errorState";

/** The user-facing sentence for an error (its common state's wording). */
export function renderErrorMessage(error: SerializedError): string {
  return classifySerializedError(error).message;
}

export function displayError(error: unknown): string {
  return renderErrorMessage(extractSerializedError(error));
}

export function sanitizeRouteError(error: unknown): string {
  if (import.meta.env.DEV) {
    console.error("Route error:", error);
  } else {
    console.error("Route error");
  }
  return renderErrorMessage(extractSerializedError(error));
}
