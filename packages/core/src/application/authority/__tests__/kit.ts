import { Account } from "@repo/core/domain/account/entity";
import {
  AccessPolicy,
  type Operation,
} from "@repo/core/domain/authority/accessPolicy";
import type { Role } from "@repo/core/domain/authority/role";
import { RoleRoster } from "@repo/core/domain/authority/roleRoster";
import {
  type Appointee,
  type GrantableRef,
  type PlaceRef,
  Stewardship,
  type StewardshipOf,
} from "@repo/core/domain/authority/stewardship";
import type { Actor } from "@repo/core/domain/common/actor";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import {
  type AccountId,
  InvitationId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import { expect } from "vitest";
import {
  createTestContainer,
  type StoredEvent,
  type TestContext,
} from "../../__tests__/testContainer";
import type { RequestContainer } from "../../di/types";
import type { GeneratedId } from "../../ports/idGenerator";
import { readActorAuthority } from "../access";
import { removeAllAuthorityOf } from "../withdrawal";
import { TestStewardedTargets } from "./testServices";

/** A registered account and the `Actor` the boundary would build for it. */
export type Person = Appointee & Readonly<{ actor: Actor }>;

export type Kit = ReturnType<typeof authorityKit>;

/**
 * Usecase-test kit for Authority: the production-shaped test container
 * with a test-only `StewardedTargetDirectory`, plus preconditions written
 * straight through the repositories (no events) and readers for the
 * results.
 */
export function authorityKit() {
  const targets = new TestStewardedTargets();
  const t: TestContext = createTestContainer({
    overrides: () => ({ stewardedTargetDirectory: targets }),
  });
  const { container, idGenerator, clock } = t;
  let people = 0;

  const newId = (): GeneratedId => idGenerator.next();

  async function person(label?: string): Promise<Person> {
    people += 1;
    const account = Account.register({
      id: newId(),
      email: `${label ?? `person${people}`}@example.com`,
    });
    await container.unitOfWorkProvider.run(({ accountRepository }) =>
      accountRepository.insert(account),
    );
    return {
      accountId: account.id,
      email: account.email,
      actor: { accountId: account.id },
    };
  }

  /** An address no account has. */
  const unregisteredEmail = (label = "nobody"): EmailAddress =>
    EmailAddress.create(`${label}-${newId().slice(-6)}@example.com`);

  const place = (name: string | null = "店舗"): PlaceRef => {
    const ref: PlaceRef = { kind: "place", id: PlaceId.create(newId()) };
    targets.add(ref, name);
    return ref;
  };
  const region = (
    name: string | null = "地域",
  ): Extract<StewardedRef, { kind: "region" }> => {
    const ref = { kind: "region", id: RegionId.create(newId()) } as const;
    targets.add(ref, name);
    return ref;
  };
  const occasion = (
    name: string | null = "イベント",
  ): Extract<StewardedRef, { kind: "occasion" }> => {
    const ref = { kind: "occasion", id: OccasionId.create(newId()) } as const;
    targets.add(ref, name);
    return ref;
  };

  const invitationId = (): GeneratedId => newId();

  const tick = (): Date => {
    clock.advance(60_000);
    return clock.now();
  };

  function findStewardship(
    target: StewardedRef,
  ): Promise<Versioned<Stewardship> | null> {
    return container.unitOfWorkProvider.run(({ stewardshipRepository }) =>
      stewardshipRepository.findById(target),
    );
  }

  async function stewardship(target: StewardedRef): Promise<Stewardship> {
    return Stewardship.orVacant(
      (await findStewardship(target))?.entity ?? null,
      target,
    );
  }

  async function writeStewardship(
    change: (current: Stewardship) => Stewardship,
    target: StewardedRef,
  ): Promise<void> {
    await container.unitOfWorkProvider.run(
      async ({ stewardshipRepository }) => {
        const found = await stewardshipRepository.findById(target);
        const next = change(
          Stewardship.orVacant(found?.entity ?? null, target),
        );
        if (found === null) await stewardshipRepository.insert(next);
        else await stewardshipRepository.save(next, found.expectedVersion);
      },
    );
  }

  function appointNow(s: Stewardship, who: Appointee): Stewardship {
    const now = tick();
    return s.target.kind === "place"
      ? Stewardship.appointByApproval(s as StewardshipOf<PlaceRef>, who, now)
          .entity
      : Stewardship.grant(s as StewardshipOf<GrantableRef>, who, now).entity;
  }

  /** Stores `who` as stewards of `target` (appointed in order). */
  async function appoint(
    target: StewardedRef,
    ...who: readonly Appointee[]
  ): Promise<void> {
    await writeStewardship(
      (current) => who.reduce(appointNow, current),
      target,
    );
  }

  /** Stores a pending invitation to `email`; returns its id. */
  async function invite(
    target: StewardedRef,
    email: EmailAddress,
  ): Promise<InvitationId> {
    const id = InvitationId.create(invitationId());
    const now = tick();
    await writeStewardship(
      (current) =>
        Stewardship.invite(current, { invitationId: id, email }, null, now)
          .entity,
      target,
    );
    return id;
  }

  async function removeSteward(
    target: StewardedRef,
    who: Appointee,
  ): Promise<void> {
    const now = tick();
    await writeStewardship(
      (current) =>
        Stewardship.removeSteward(current, who.accountId, "resigned", now)
          .entity,
      target,
    );
  }

  async function cancel(target: StewardedRef, id: InvitationId): Promise<void> {
    await writeStewardship(
      (current) => Stewardship.cancelInvitation(current, id).entity,
      target,
    );
  }

  function roster<R extends Role>(role: R) {
    return container.unitOfWorkProvider.run(({ roleRosterRepository }) =>
      roleRosterRepository.find(role),
    );
  }

  /** Stores the operator roster (the first establishes it) — no events. */
  async function operators(...who: readonly Appointee[]): Promise<void> {
    await container.unitOfWorkProvider.run(async ({ roleRosterRepository }) => {
      const read = await roleRosterRepository.find("operator");
      let next: RoleRoster = read.entity;
      for (const holder of who) {
        next =
          next.role === "operator" && next.status === "unestablished"
            ? RoleRoster.establishOperators(next, holder.accountId, tick())
                .entity
            : RoleRoster.grant(next, holder.accountId, tick()).entity;
      }
      await roleRosterRepository.save(next, read.expectedVersion);
    });
  }

  async function editors(...who: readonly Appointee[]): Promise<void> {
    await container.unitOfWorkProvider.run(async ({ roleRosterRepository }) => {
      const read = await roleRosterRepository.find("editor");
      let next: RoleRoster = read.entity;
      for (const holder of who) {
        next = RoleRoster.grant(next, holder.accountId, tick()).entity;
      }
      await roleRosterRepository.save(next, read.expectedVersion);
    });
  }

  async function revokeHolder(role: Role, who: Appointee): Promise<void> {
    await container.unitOfWorkProvider.run(async ({ roleRosterRepository }) => {
      const read = await roleRosterRepository.find(role);
      await roleRosterRepository.save(
        RoleRoster.removeHolder(read.entity, who.accountId, "revoked", tick())
          .entity,
        read.expectedVersion,
      );
    });
  }

  function holders(role: Role) {
    return roster(role).then(({ entity }) =>
      RoleRoster.holders(entity).map((holder) => holder.accountId),
    );
  }

  function findAccount(who: Appointee) {
    return container.unitOfWorkProvider.run(({ accountRepository }) =>
      accountRepository.findById(who.accountId),
    );
  }

  async function getAccount(who: Appointee) {
    const found = await findAccount(who);
    if (found === null) throw new Error(`no account ${who.accountId}`);
    return found;
  }

  /** Deletes the account directly (a withdrawal that committed first). */
  async function deleteAccount(who: Appointee): Promise<void> {
    const read = await getAccount(who);
    await container.unitOfWorkProvider.run(({ accountRepository }) =>
      accountRepository.delete(who.accountId, read.expectedVersion),
    );
  }

  /**
   * Account's `withdraw` as far as Authority is concerned: the account's
   * delete and `removeAllAuthorityOf` in one unit of work.
   */
  async function withdraw(who: Appointee): Promise<void> {
    await container.unitOfWorkProvider.run(async (ctx) => {
      const read = await ctx.accountRepository.findById(who.accountId);
      if (read === null) throw new Error("already withdrawn");
      const drafts = await removeAllAuthorityOf(ctx, who.accountId, tick());
      await ctx.accountRepository.delete(who.accountId, read.expectedVersion);
      ctx.collectEvents(drafts);
    });
  }

  async function decide(who: Appointee, operation: Operation) {
    const authority = await container.unitOfWorkProvider.run((ctx) =>
      readActorAuthority(ctx, { accountId: who.accountId }),
    );
    return AccessPolicy.decide(authority, operation);
  }

  /** Marks the outbox; `since(mark)` returns the events stored after it. */
  async function mark(): Promise<number> {
    return (await t.storedEvents()).length;
  }

  async function since(markAt: number): Promise<readonly StoredEvent[]> {
    return (await t.storedEvents()).slice(markAt);
  }

  return {
    t,
    container,
    targets,
    clock,
    person,
    unregisteredEmail,
    place,
    region,
    occasion,
    invitationId,
    tick,
    findStewardship,
    stewardship,
    appoint,
    invite,
    removeSteward,
    cancel,
    roster,
    operators,
    editors,
    revokeHolder,
    holders,
    findAccount,
    getAccount,
    deleteAccount,
    withdraw,
    decide,
    mark,
    since,
  };
}

export const stewardIds = (s: Stewardship): readonly AccountId[] =>
  Stewardship.stewards(s).map((steward) => steward.accountId);

export const invitationEmails = (s: Stewardship): readonly EmailAddress[] =>
  s.invitations.map((invitation) => invitation.email);

/**
 * A container whose first unit of work runs `beforeCommit` after its
 * callback (every read done, writes buffered) and before it commits — so
 * `beforeCommit` can let a competing request commit first.
 */
export function commitAfter(
  container: RequestContainer,
  beforeCommit: () => Promise<unknown>,
): RequestContainer {
  let fired = false;
  return {
    ...container,
    unitOfWorkProvider: {
      run: (fn) =>
        container.unitOfWorkProvider.run(async (ctx) => {
          const result = await fn(ctx);
          if (!fired) {
            fired = true;
            await beforeCommit();
          }
          return result;
        }),
    },
  };
}

/** Awaits `promise` and returns what it rejected with. */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("Expected a rejection");
    },
    (error: unknown) => error,
  );
}

export async function expectCode(
  promise: Promise<unknown>,
  errorClass: abstract new (...args: never[]) => Error,
  code?: string,
): Promise<void> {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(errorClass);
  if (code !== undefined) {
    expect((error as { code?: unknown }).code).toBe(code);
  }
}
