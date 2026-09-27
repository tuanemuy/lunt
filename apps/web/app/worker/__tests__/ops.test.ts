import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import { NotFoundError } from "@repo/core/application/errors";
import { AuthorityErrorCode } from "@repo/core/domain/authority/errorCode";
import { BusinessRuleError } from "@repo/core/domain/error";
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

const unused = async () => {
  throw new Error("not expected");
};

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
      { opsToken: null, client: client(), establishFirstOperator: unused },
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
        { opsToken: TOKEN, client: c, establishFirstOperator: unused },
      );
      expect(response.status).toBe(401);
    }
    expect(c.listDeadLetters).not.toHaveBeenCalled();
  });

  it("lists pending dead letters", async () => {
    const c = client();
    const response = await handleOpsRequest(
      request("GET", "/__ops/dead-letters?limit=5"),
      { opsToken: TOKEN, client: c, establishFirstOperator: unused },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deadLetters: [] });
    expect(c.listDeadLetters).toHaveBeenCalledWith(5);
  });

  it("re-drives by limit or by keys, and rejects a malformed body", async () => {
    const c = client();
    const deps = { opsToken: TOKEN, client: c, establishFirstOperator: unused };
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
      { opsToken: TOKEN, client: c, establishFirstOperator: unused },
    );
    expect(response.status).toBe(200);
    expect(c.kickRelay).toHaveBeenCalledOnce();
  });

  it("establishes the first operator from an email, and maps refusals to statuses", async () => {
    const establish = vi.fn(async (email: string) => {
      if (email === "nobody@example.com") {
        throw new NotFoundError("ACCOUNT_NOT_FOUND", "No account");
      }
      if (email === "late@example.com") {
        throw new BusinessRuleError(
          AuthorityErrorCode.OperatorsAlreadyEstablished,
          "Operators already exist",
        );
      }
    });
    const deps = {
      opsToken: TOKEN,
      client: client(),
      establishFirstOperator: establish,
    };
    const post = (body: string) =>
      handleOpsRequest(
        request("POST", "/__ops/operators/establish", { body }),
        deps,
      );

    const ok = await post(JSON.stringify({ email: "first@example.com" }));
    const missing = await post(JSON.stringify({ email: "nobody@example.com" }));
    const late = await post(JSON.stringify({ email: "late@example.com" }));
    const malformed = await post("{");
    const invalid = await post(JSON.stringify({ address: "x@example.com" }));

    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ established: "first@example.com" });
    expect(missing.status).toBe(404);
    expect(late.status).toBe(422);
    expect(await late.json()).toMatchObject({
      error: {
        kind: "business",
        code: "AUTHORITY_OPERATORS_ALREADY_ESTABLISHED",
      },
    });
    expect([malformed.status, invalid.status]).toEqual([400, 400]);
    expect(establish.mock.calls.map(([email]) => email)).toEqual([
      "first@example.com",
      "nobody@example.com",
      "late@example.com",
    ]);
  });
});
