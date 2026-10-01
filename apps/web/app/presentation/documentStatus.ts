// Server-only: imported by the Worker entry (`server.ts`).
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { extractSerializedError, httpStatusFor } from "./errorResponse";

/** What `documentStatusOf` reads of a route match. */
export type MatchOutcome = Readonly<{ status: string; error: unknown }>;

/**
 * The HTTP status of a document whose route failed to load: from the
 * serialized kind of what the route's guard or loader threw, mapped as
 * server functions answer (`httpStatusFor`) — CS-05 403, CS-06 / CS-17
 * 404, a system error 500. `null` when no route failed: the router's own
 * status stands (200, or 404 for a not-found).
 */
export function documentStatusOf(
  matches: readonly MatchOutcome[],
): number | null {
  const failed = matches.find((match) => match.status === "error");
  return failed === undefined
    ? null
    : httpStatusFor(extractSerializedError(failed.error));
}

type DocumentResult = Awaited<ReturnType<typeof defaultStreamHandler>>;

function withStatus(result: DocumentResult, status: number): DocumentResult {
  const replace = (response: Response): Response =>
    response.status === status
      ? response
      : new Response(response.body, { status, headers: response.headers });
  return result instanceof Response
    ? replace(result)
    : { ...result, response: replace(result.response) };
}

/**
 * TanStack Start's document handler, whose response status follows the
 * common state a failed route renders. The router answers every route
 * error with 500, so a refused screen (CS-05) would read as a server
 * fault.
 */
export const fetchDocument = createStartHandler(async (context) => {
  const result = await defaultStreamHandler(context);
  const status = documentStatusOf(context.router.state.matches);
  return status === null ? result : withStatus(result, status);
});
