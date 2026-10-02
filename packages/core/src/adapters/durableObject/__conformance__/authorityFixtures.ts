import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { NotFoundError } from "@repo/core/application/errors";
import type { Role } from "@repo/core/domain/authority/role";
import type {
  RoleRoster,
  RosterOf,
} from "@repo/core/domain/authority/roleRoster";
import {
  type Appointee,
  type GrantableRef,
  type PlaceRef,
  Stewardship,
  type StewardshipOf,
} from "@repo/core/domain/authority/stewardship";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import {
  AccountId,
  InvitationId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type { ConformanceHarness } from "./harness";

export const T0 = new Date("2026-09-01T00:00:00.000Z");

/**
 * Ids for one test, ascending in mint order (so "P1 < P2" holds), plus
 * account appointees with distinct emails.
 */
export function authorityIds() {
  const ids = new FakeIdGenerator(0x10_0000);
  let accounts = 0;
  let clock = T0.getTime();
  return {
    person: (): Appointee => {
      accounts += 1;
      return {
        accountId: AccountId.create(ids.next()),
        email: EmailAddress.create(`member${accounts}@example.com`),
      };
    },
    place: (): PlaceRef => ({ kind: "place", id: PlaceId.create(ids.next()) }),
    region: (): Extract<StewardedRef, { kind: "region" }> => ({
      kind: "region",
      id: RegionId.create(ids.next()),
    }),
    occasion: (): Extract<StewardedRef, { kind: "occasion" }> => ({
      kind: "occasion",
      id: OccasionId.create(ids.next()),
    }),
    invitation: (): InvitationId => InvitationId.create(ids.next()),
    /** Strictly increasing instants, one per call. */
    tick: (): Date => {
      clock += 60_000;
      return new Date(clock);
    },
  };
}

export type AuthorityIds = ReturnType<typeof authorityIds>;

/** Appoints through the route the target's kind allows. */
export function appoint<T extends StewardedRef>(
  s: StewardshipOf<T>,
  who: Appointee,
  now: Date,
): StewardshipOf<T> {
  const appointed =
    s.target.kind === "place"
      ? Stewardship.appointByApproval(s as StewardshipOf<PlaceRef>, who, now)
      : Stewardship.grant(s as StewardshipOf<GrantableRef>, who, now);
  return appointed.entity as StewardshipOf<T>;
}

/**
 * A stewardship of `target` built from `Stewardship.vacant` with the
 * given stewards (appointed in order) and `invitations` invitations.
 */
export function stewardshipOf<T extends StewardedRef>(
  ids: AuthorityIds,
  target: T,
  stewards: readonly Appointee[],
  invitations = 0,
): StewardshipOf<T> {
  let s = Stewardship.vacant(target);
  for (const who of stewards) s = appoint(s, who, ids.tick());
  for (let i = 0; i < invitations; i += 1) {
    s = Stewardship.invite(
      s,
      { invitationId: ids.invitation(), email: ids.person().email },
      null,
      ids.tick(),
    ).entity;
  }
  return s;
}

export function withoutSteward<T extends StewardedRef>(
  s: StewardshipOf<T>,
  who: Appointee,
  now: Date,
): StewardshipOf<T> {
  return Stewardship.removeSteward(s, who.accountId, "resigned", now).entity;
}

export async function insertStewardships(
  h: ConformanceHarness,
  ...stewardships: readonly Stewardship[]
): Promise<void> {
  await h.uow.run(async ({ stewardshipRepository }) => {
    for (const s of stewardships) await stewardshipRepository.insert(s);
  });
}

export function findStewardship(
  h: ConformanceHarness,
  target: StewardedRef,
): Promise<Versioned<Stewardship> | null> {
  return h.uow.run(({ stewardshipRepository }) =>
    stewardshipRepository.findById(target),
  );
}

export async function getStewardship(
  h: ConformanceHarness,
  target: StewardedRef,
): Promise<Versioned<Stewardship>> {
  const found = await findStewardship(h, target);
  if (found === null) {
    throw new NotFoundError("TEST", `no stewardship of ${target.id}`);
  }
  return found;
}

export function saveStewardship(
  h: ConformanceHarness,
  s: Stewardship,
  expectedVersion: ExpectedVersion<Stewardship>,
): Promise<void> {
  return h.uow.run(({ stewardshipRepository }) =>
    stewardshipRepository.save(s, expectedVersion),
  );
}

export function findByTargets(
  h: ConformanceHarness,
  targets: readonly StewardedRef[],
) {
  return h.uow.run(({ stewardshipRepository }) =>
    stewardshipRepository.findByTargets(targets),
  );
}

export const FIRST_PAGE: Pagination = { page: 1, limit: 100 };

export function findPageBySteward(
  h: ConformanceHarness,
  who: Appointee,
  pagination: Pagination = FIRST_PAGE,
) {
  return h.uow.run(({ stewardshipRepository }) =>
    stewardshipRepository.findPageBySteward(who.accountId, pagination),
  );
}

export function findRoster<R extends Role>(
  h: ConformanceHarness,
  role: R,
): Promise<Versioned<RosterOf<R>>> {
  return h.uow.run(({ roleRosterRepository }) =>
    roleRosterRepository.find(role),
  );
}

export function saveRoster(
  h: ConformanceHarness,
  roster: RoleRoster,
  expectedVersion: ExpectedVersion<RoleRoster>,
): Promise<void> {
  return h.uow.run(({ roleRosterRepository }) =>
    roleRosterRepository.save(roster, expectedVersion),
  );
}

export function findRolesOf(h: ConformanceHarness, accountId: AccountId) {
  return h.uow.run(({ roleRosterRepository }) =>
    roleRosterRepository.findRolesOf(accountId),
  );
}
