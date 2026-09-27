import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import { describe, expect, it, vi } from "vitest";
import { handleOpsRequest } from "../ops";

const TOKEN = "an-operations-token-long-enough-0123456789";

function client() {
  return {
    listDeadLetters: vi.fn(async () => []),
    redriveDeadLetters: vi.fn(async () => ({ redriven: [], failed: [] })),
    kickRelay: vi.fn(async () => {}),
  } satisfies Pick<
    LuntStateClient,
    "listDeadLetters" | "redriveDeadLetters" | "kickRelay"
  >;
}

function request(method: string, path: string, init: RequestInit = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, ...init.headers },
  });
}

describe("handleOpsRequest", () => {
  it("does not exist when no operations token is configured", async () => {
    const response = await handleOpsRequest(
      request("GET", "/__ops/dead-letters"),
      { opsToken: null, client: client() },
    );
    expect(response.status).toBe(404);
  });

  it("refuses a missing or wrong token", async () => {
    const c = client();
    for (const headers of [
      { Authorization: "" },
      { Authorization: "Bearer nope" },
    ]) {
      const response = await handleOpsRequest(
        request("GET", "/__ops/dead-letters", { headers }),
        { opsToken: TOKEN, client: c },
      );
      expect(response.status).toBe(401);
    }
    expect(c.listDeadLetters).not.toHaveBeenCalled();
  });

  it("lists pending dead letters", async () => {
    const c = client();
    const response = await handleOpsRequest(
      request("GET", "/__ops/dead-letters?limit=5"),
      { opsToken: TOKEN, client: c },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deadLetters: [] });
    expect(c.listDeadLetters).toHaveBeenCalledWith(5);
  });

  it("re-drives by limit or by keys, and rejects a malformed body", async () => {
    const c = client();
    const deps = { opsToken: TOKEN, client: c };
    const byLimit = await handleOpsRequest(
      request("POST", "/__ops/dead-letters/redrive", {
        body: JSON.stringify({ limit: 20 }),
      }),
      deps,
    );
    const byKeys = await handleOpsRequest(
      request("POST", "/__ops/dead-letters/redrive", {
        body: JSON.stringify({ keys: [{ consumer: "a", eventId: "e1" }] }),
      }),
      deps,
    );
    const malformed = await handleOpsRequest(
      request("POST", "/__ops/dead-letters/redrive", { body: "{" }),
      deps,
    );
    const invalid = await handleOpsRequest(
      request("POST", "/__ops/dead-letters/redrive", {
        body: JSON.stringify({ limit: 0 }),
      }),
      deps,
    );

    expect([byLimit.status, byKeys.status]).toEqual([200, 200]);
    expect(c.redriveDeadLetters.mock.calls).toEqual([
      [{ limit: 20 }],
      [{ keys: [{ consumer: "a", eventId: "e1" }] }],
    ]);
    expect([malformed.status, invalid.status]).toEqual([400, 400]);
  });

  it("kicks the relay", async () => {
    const c = client();
    const response = await handleOpsRequest(
      request("POST", "/__ops/relay/kick"),
      { opsToken: TOKEN, client: c },
    );
    expect(response.status).toBe(200);
    expect(c.kickRelay).toHaveBeenCalledOnce();
  });
});
