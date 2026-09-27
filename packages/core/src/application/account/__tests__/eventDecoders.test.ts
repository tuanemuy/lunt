import { SystemError } from "@repo/core/application/errors";
import { AccountEvents } from "@repo/core/domain/account/events";
import { EventId } from "@repo/core/domain/common/event";
import { AccountId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { accountEventDecoders } from "../eventDecoders";

const NOW = new Date("2026-09-28T00:00:00.000Z");
const account = AccountId.create("ffffffff-ffff-7fff-8fff-000000000001");
const meta = {
  id: EventId.create("ffffffff-ffff-7fff-8fff-0000000000e1"),
  occurredAt: NOW,
  aggregateId: account,
};

describe("accountEventDecoders", () => {
  it("round-trips account.withdrawn through its stored JSON", () => {
    const draft = AccountEvents.withdrawn(account, NOW);
    const stored = JSON.parse(JSON.stringify(draft.payload));

    const event = accountEventDecoders["account.withdrawn"](stored, meta);

    expect(event).toEqual({
      ...meta,
      type: "account.withdrawn",
      payload: { accountId: account },
    });
  });

  it("refuses a stored payload with a blank id or an extra field", () => {
    expect(() =>
      accountEventDecoders["account.withdrawn"]({ accountId: " " }, meta),
    ).toThrow(SystemError);
    expect(() =>
      accountEventDecoders["account.withdrawn"](
        { accountId: account, extra: 1 },
        meta,
      ),
    ).toThrow(SystemError);
  });
});
