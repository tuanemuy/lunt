import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import { z } from "zod";
import {
  httpStatusFor,
  redactForClient,
  serializeError,
} from "../presentation/errorResponse";

export const OPS_PREFIX = "/__ops/";

const MAX_LIMIT = 500;

const redriveSchema = z.union([
  z.object({
    keys: z
      .array(
        z.object({
          consumer: z.string().min(1).max(200),
          eventId: z.string().min(1).max(200),
        }),
      )
      .min(1)
      .max(MAX_LIMIT),
  }),
  z.object({ limit: z.number().int().min(1).max(MAX_LIMIT) }),
]);

const establishOperatorSchema = z
  .object({ email: z.string().min(1).max(320) })
  .strict();

const encoder = new TextEncoder();

/** Compares in time independent of where the inputs first differ. */
async function sameToken(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all(
    [given, expected].map(
      async (value) =>
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", encoder.encode(value)),
        ),
    ),
  );
  let difference = 0;
  for (let i = 0; i < 32; i++) difference |= (a?.[i] ?? 0) ^ (b?.[i] ?? 0);
  return difference === 0;
}

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status });

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") return {};
  return JSON.parse(text) as unknown;
}

/**
 * Operations endpoints of the Lunt Worker, for an operator with the
 * `OPS_TOKEN` bearer token (off when the token is not configured):
 *
 * - `GET /__ops/dead-letters?limit=N` — dead letters not yet re-driven
 * - `POST /__ops/dead-letters/redrive` — body `{ "limit": N }` (oldest
 *   first) or `{ "keys": [{ "consumer", "eventId" }, …] }`: send them back
 *   to their consumers through the events queue
 * - `POST /__ops/relay/kick` — requeue parked outbox rows and relay now
 * - `POST /__ops/operators/establish` — body `{ "email": "…" }`: make the
 *   existing account of that address the first service operator
 *   (`establishFirstOperator`; resending for the same account succeeds,
 *   another address once operators exist is refused)
 *
 * `spec/domains/index.md` 「トランザクションとドメインイベント」: DLQ からの
 * 再投入は運用が行う; `spec/usecases/authority.md` `establishFirstOperator`:
 * the opening procedure. `docs/runtime_cloudflare_do.md` has both.
 */
export async function handleOpsRequest(
  request: Request,
  deps: Readonly<{
    opsToken: string | null;
    client: Pick<
      LuntStateClient,
      "listDeadLetters" | "redriveDeadLetters" | "kickRelay"
    >;
    establishFirstOperator: (email: string) => Promise<void>;
  }>,
): Promise<Response> {
  if (deps.opsToken === null) {
    return new Response("Not Found", { status: 404 });
  }
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!(await sameToken(token, deps.opsToken))) {
    return json({ error: "unauthorized" }, 401);
  }
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;
  switch (route) {
    case "GET /__ops/dead-letters": {
      const limit = z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_LIMIT)
        .catch(100)
        .parse(url.searchParams.get("limit") ?? undefined);
      return json({ deadLetters: await deps.client.listDeadLetters(limit) });
    }
    case "POST /__ops/dead-letters/redrive": {
      let body: unknown;
      try {
        body = await readBody(request);
      } catch {
        return json({ error: "invalid JSON" }, 400);
      }
      const parsed = redriveSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: parsed.error.message }, 400);
      }
      return json(await deps.client.redriveDeadLetters(parsed.data));
    }
    case "POST /__ops/relay/kick":
      await deps.client.kickRelay();
      return json({ kicked: true });
    case "POST /__ops/operators/establish": {
      let body: unknown;
      try {
        body = await readBody(request);
      } catch {
        return json({ error: "invalid JSON" }, 400);
      }
      const parsed = establishOperatorSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: parsed.error.message }, 400);
      }
      try {
        await deps.establishFirstOperator(parsed.data.email);
      } catch (error) {
        const serialized = serializeError(error);
        return json(
          { error: redactForClient(serialized) },
          httpStatusFor(serialized),
        );
      }
      return json({ established: parsed.data.email });
    }
    default:
      return new Response("Not Found", { status: 404 });
  }
}
