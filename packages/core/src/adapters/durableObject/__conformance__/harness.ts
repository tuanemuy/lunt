import type { UnitOfWorkProvider } from "@repo/core/application/execution/unitOfWork";

/** An outbox row as the relay would pick it up. */
export type SavedEvent = Readonly<{
  type: string;
  aggregateId: string;
  payload: unknown;
}>;

/**
 * What a port conformance suite needs from the backend under test. The
 * Node runner builds it over `node:sqlite`, the Workers runner over the
 * real Durable Object; each call returns a fresh, empty store.
 */
export type ConformanceHarness = Readonly<{
  uow: UnitOfWorkProvider;
  /** Every domain event the outbox holds, in insertion order. */
  savedEvents(): Promise<readonly SavedEvent[]>;
}>;

export type HarnessFactory = () => Promise<ConformanceHarness>;
