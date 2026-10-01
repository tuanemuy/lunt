// Server-only: import from server components, never from client components.
import { getContainer } from "@repo/core/application/di/containerStore";
import {
  ConsoleLogger,
  type Logger,
} from "@repo/core/application/ports/logger";
import { isAppServerError, serializeError } from "./errorResponse";
import { classifyError, type ErrorState } from "./errorState";

/**
 * The common state a server component shows for a read that threw
 * (`classifyError`), recording the unexpected failures — a `SystemError`
 * or anything that is not one of the shared error contracts — through
 * `logger`. The expected kinds (not found, forbidden, login required,
 * business rules, conflicts, validation) are screen states, not faults,
 * and are not recorded. An `AppServerError` already went through
 * `errorResponseMiddleware`, which recorded it.
 */
export function readStateOf(error: unknown, logger: Logger): ErrorState {
  if (!isAppServerError(error)) {
    const serialized = serializeError(error);
    if (serialized.kind === "system" || serialized.kind === "unknown") {
      logger.error("Server component read failed", {
        kind: serialized.kind,
        code: serialized.code,
        message: serialized.message,
        cause: error,
      });
    }
  }
  return classifyError(error);
}

/**
 * `readStateOf` with the request's logger (the console when the container
 * itself cannot be had): what every server component that renders its own
 * common state calls in its `catch`.
 */
export async function readFailureState(error: unknown): Promise<ErrorState> {
  const logger = await getContainer().then(
    (container) => container.logger,
    () => ConsoleLogger,
  );
  return readStateOf(error, logger);
}
