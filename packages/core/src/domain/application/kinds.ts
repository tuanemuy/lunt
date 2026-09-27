import type { KindRegistry } from "./kind";

/**
 * The production application kinds — the one place a kind joins Lunt.
 *
 * A stage that brings a kind's domains adds, in `kinds/{kind}.ts`, the
 * kind's `KindSpec` (target, content, premises, seat, slot, request) and
 * its `KindDefinition` (built with `defineKind`), then one entry here in
 * each of `ApplicationKindMap` and `APPLICATION_KINDS`:
 *
 * - S2B: `registration`, `revision`, `stewardship`, `listing`,
 *   `listingRevision`
 * - S3B: `affiliation`, `leave`, `participation`
 *
 * The core (`model.ts`), the ports and the storage are written against
 * any registry and do not change. Stage 1 registers none; the domain
 * tests and the port conformance suites run over the test-only kinds in
 * `__tests__/testKinds.ts`, which mirror the spec's eight target shapes.
 */
export type ApplicationKindMap = Readonly<Record<never, never>>;

export const APPLICATION_KINDS: KindRegistry<ApplicationKindMap> = {};
