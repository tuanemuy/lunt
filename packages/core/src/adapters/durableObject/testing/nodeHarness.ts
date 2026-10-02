import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import type { Clock } from "@repo/core/application/ports/clock";
import type { ConformanceHarness } from "../__conformance__/harness";
import { DoUnitOfWorkProvider } from "../unitOfWork";
import { createInProcessState, type InProcessState } from "./inProcessState";

const FAR_FUTURE = new Date("9999-01-01T00:00:00.000Z");

/**
 * Conformance harness over a fresh in-memory store. Saved events are read
 * the way the relay reads them — `claimPending` — with a zero lease so
 * every call sees every pending row again.
 */
export function createNodeHarness(
  clock: Clock = { now: () => new Date("2026-09-28T00:00:00.000Z") },
): ConformanceHarness & Readonly<{ state: InProcessState }> {
  const idGenerator = new FakeIdGenerator(0x1_0000_0000);
  const state = createInProcessState({ clock, idGenerator });
  return {
    state,
    uow: new DoUnitOfWorkProvider(state.client, idGenerator),
    savedEvents: async () =>
      (
        await state.outboxRepository.claimPending({
          limit: 10_000,
          now: FAR_FUTURE,
          workerId: "conformance",
          leaseMs: 0,
        })
      ).map((entry) => ({
        type: entry.type,
        aggregateId: entry.aggregateId,
        payload: entry.payload,
      })),
  };
}
