import type { KindRegistry } from "./kind";
import { type AffiliationKind, affiliation } from "./kinds/affiliation";
import { type LeaveKind, leave } from "./kinds/leave";
import { type ListingKind, listing } from "./kinds/listing";
import {
  type ListingRevisionKind,
  listingRevision,
} from "./kinds/listingRevision";
import { type ParticipationKind, participation } from "./kinds/participation";
import { type RegistrationKind, registration } from "./kinds/registration";
import { type RevisionKind, revision } from "./kinds/revision";
import { type StewardshipKind, stewardship } from "./kinds/stewardship";

/**
 * The production application kinds — the one place a kind joins Lunt.
 *
 * Each of the spec's eight kinds has, in `kinds/{kind}.ts`, its
 * `KindSpec` (target, content, premises, seat, slot, request) and its
 * `KindDefinition` (built with `defineKind`), and one entry here in each
 * of `ApplicationKindMap` and `APPLICATION_KINDS`.
 *
 * The core (`model.ts`), the ports and the storage are written against
 * any registry and do not change. The kind-agnostic domain tests and the
 * port conformance suites run over the test-only kinds in
 * `__tests__/testKinds.ts`, which mirror the spec's eight target shapes.
 */
export type ApplicationKindMap = {
  registration: RegistrationKind;
  revision: RevisionKind;
  stewardship: StewardshipKind;
  affiliation: AffiliationKind;
  leave: LeaveKind;
  participation: ParticipationKind;
  listing: ListingKind;
  listingRevision: ListingRevisionKind;
};

export const APPLICATION_KINDS: KindRegistry<ApplicationKindMap> = {
  registration,
  revision,
  stewardship,
  affiliation,
  leave,
  participation,
  listing,
  listingRevision,
};
