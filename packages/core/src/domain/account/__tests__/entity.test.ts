import {
  isBusinessRuleError,
  isRehydrationError,
} from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { Account } from "../entity";

const ID = "ffffffff-ffff-7fff-8fff-000000000001";
const NOW = new Date("2026-09-28T00:00:00.000Z");

describe("Account", () => {
  it("register creates an account at the initial version with a normalized email", () => {
    const account = Account.register({
      id: ID,
      email: "  Hanako@Example.COM ",
    });
    expect(account).toEqual({
      id: ID,
      email: "hanako@example.com",
      version: 0,
    });
  });

  it("register rejects an invalid email address or id", () => {
    for (const params of [
      { id: ID, email: "not-an-email" },
      { id: "  ", email: "a@example.com" },
    ]) {
      let error: unknown;
      try {
        Account.register(params);
      } catch (thrown) {
        error = thrown;
      }
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });

  it("markReferenced advances only the version", () => {
    const account = Account.register({ id: ID, email: "a@example.com" });
    const referenced = Account.markReferenced(account);
    expect(referenced).toEqual({ ...account, version: 1 });
  });

  it("withdraw drafts account.withdrawn for the account", () => {
    const account = Account.register({ id: ID, email: "a@example.com" });
    expect(Account.withdraw(account, NOW)).toEqual([
      {
        type: "account.withdrawn",
        payload: { accountId: ID },
        occurredAt: NOW,
        aggregateId: ID,
      },
    ]);
  });

  it("reconstruct restores a stored account", () => {
    expect(
      Account.reconstruct({ id: ID, email: "a@example.com", version: 3 }),
    ).toEqual({ id: ID, email: "a@example.com", version: 3 });
  });

  it("reconstruct refuses stored values that break an invariant", () => {
    for (const stored of [
      { id: ID, email: "broken", version: 0 },
      { id: ID, email: "A@example.com", version: 0 },
      { id: ID, email: "a@example.com", version: -1 },
    ]) {
      let error: unknown;
      try {
        Account.reconstruct(stored);
      } catch (thrown) {
        error = thrown;
      }
      expect(isRehydrationError(error)).toBe(true);
    }
  });
});
