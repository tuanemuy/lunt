import { Account } from "@repo/core/domain/account/entity";
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
import { type EventDraft, EventId } from "@repo/core/domain/common/event";
import {
  type AccountId,
  ApplicationId,
  InvitationId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { NotifiableEvent } from "@repo/core/domain/notification/announcement";
import type { Notification } from "@repo/core/domain/notification/notification";
import {
  createTestContainer,
  type TestContext,
} from "../../__tests__/testContainer";
import { removeAllAuthorityOf } from "../../authority/withdrawal";
import type { RequestContainer } from "../../di/types";
import { TestContentDirectory } from "../../moderation/__tests__/testServices";
import {
  deliverNotifications,
  deliverNotificationsOf,
} from "../deliverNotifications";
import { TestMailer } from "./testServices";

/** A registered account and its `Actor`. */
export type Person = Appointee & Readonly<{ actor: Actor }>;

export type Kit = ReturnType<typeof notificationKit>;

const FAR = { page: 1, limit: 100 } as const;

/**
 * Usecase-test kit for Notification: the production-shaped test container
 * with a test `ContentDirectory` (no content kind has tables in stage 1)
 * and a `TestMailer`, preconditions written straight through the
 * repositories (no events), and readers for what was delivered.
 */
export function notificationKit(
  options: Readonly<{
    overrides?: (container: RequestContainer) => Partial<RequestContainer>;
  }> = {},
) {
  const directory = new TestContentDirectory();
  const mailer = new TestMailer();
  const t: TestContext = createTestContainer({
    overrides: () => ({ contentDirectory: directory, mailer }),
  });
  const base = t.container;
  const container: RequestContainer = {
    ...base,
    ...(options.overrides?.(base) ?? {}),
  };
  const { idGenerator, clock } = t;
  let people = 0;

  const tick = (): Date => {
    clock.advance(60_000);
    return clock.now();
  };

  async function person(label?: string): Promise<Person> {
    people += 1;
    const account = Account.register({
      id: idGenerator.next(),
      email: `${label ?? `person${people}`}@example.com`,
    });
    await base.unitOfWorkProvider.run(({ accountRepository }) =>
      accountRepository.insert(account),
    );
    return {
      accountId: account.id,
      email: account.email,
      actor: { accountId: account.id },
    };
  }

  const place = (name: string | null = "店舗"): PlaceRef => {
    const ref: PlaceRef = {
      kind: "place",
      id: PlaceId.create(idGenerator.next()),
    };
    directory.add(ref, name);
    return ref;
  };
  const region = (
    name: string | null = "地域",
  ): Extract<StewardedRef, { kind: "region" }> => {
    const ref = {
      kind: "region",
      id: RegionId.create(idGenerator.next()),
    } as const;
    directory.add(ref, name);
    return ref;
  };
  const occasion = (
    name: string | null = "イベント",
  ): Extract<StewardedRef, { kind: "occasion" }> => {
    const ref = {
      kind: "occasion",
      id: OccasionId.create(idGenerator.next()),
    } as const;
    directory.add(ref, name);
    return ref;
  };
  const applicationId = () => ApplicationId.create(idGenerator.next());
  const invitationId = () => InvitationId.create(idGenerator.next());

  async function writeStewardship(
    target: StewardedRef,
    change: (current: Stewardship) => Stewardship,
  ): Promise<void> {
    await base.unitOfWorkProvider.run(async ({ stewardshipRepository }) => {
      const found = await stewardshipRepository.findById(target);
      const next = change(Stewardship.orVacant(found?.entity ?? null, target));
      if (found === null) await stewardshipRepository.insert(next);
      else await stewardshipRepository.save(next, found.expectedVersion);
    });
  }

  function appointNow(s: Stewardship, who: Appointee): Stewardship {
    const now = tick();
    return s.target.kind === "place"
      ? Stewardship.appointByApproval(s as StewardshipOf<PlaceRef>, who, now)
          .entity
      : Stewardship.grant(s as StewardshipOf<GrantableRef>, who, now).entity;
  }

  /** Stores `who` as stewards of `target`, appointed in order. */
  const appoint = (target: StewardedRef, ...who: readonly Appointee[]) =>
    writeStewardship(target, (current) => who.reduce(appointNow, current));

  /** Removes `who` from `target`'s stewards (a resignation, no events). */
  const removeSteward = (target: StewardedRef, who: Appointee) =>
    writeStewardship(
      target,
      (current) =>
        Stewardship.removeSteward(current, who.accountId, "resigned", tick())
          .entity,
    );

  /** Stores the operator roster (the first establishes it) — no events. */
  async function operators(...who: readonly Appointee[]): Promise<void> {
    await base.unitOfWorkProvider.run(async ({ roleRosterRepository }) => {
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
    await base.unitOfWorkProvider.run(async ({ roleRosterRepository }) => {
      const read = await roleRosterRepository.find("editor");
      let next: RoleRoster = read.entity;
      for (const holder of who) {
        next = RoleRoster.grant(next, holder.accountId, tick()).entity;
      }
      await roleRosterRepository.save(next, read.expectedVersion);
    });
  }

  /**
   * Account's `withdraw` as far as Notification's facts go: the account's
   * delete and the removal of all its authority, in one unit of work.
   */
  async function withdraw(who: Appointee): Promise<void> {
    await base.unitOfWorkProvider.run(async (ctx) => {
      const read = await ctx.accountRepository.findById(who.accountId);
      if (read === null) throw new Error("already withdrawn");
      await removeAllAuthorityOf(ctx, who.accountId, tick());
      await ctx.accountRepository.delete(who.accountId, read.expectedVersion);
    });
  }

  /** A stored domain event built from a draft, with a fresh id. */
  function event(draft: EventDraft<NotifiableEvent>): NotifiableEvent {
    return {
      ...draft,
      id: EventId.create(idGenerator.next()),
    } as NotifiableEvent;
  }

  /**
   * Consumes `e` as the relay would: through the registered consumer for
   * the types it subscribes to, and through the usecase for Application's
   * events until they join the registry.
   */
  async function consume(e: NotifiableEvent): Promise<void> {
    tick();
    if ((deliverNotifications.events as readonly string[]).includes(e.type)) {
      await deliverNotifications.handle(
        container,
        e as Parameters<typeof deliverNotifications.handle>[1],
      );
      return;
    }
    await deliverNotificationsOf(container, e);
  }

  /** Resolves to the error `consume` rejected with (fails if it did not). */
  async function consumeFailing(e: NotifiableEvent): Promise<unknown> {
    return consume(e).then(
      () => {
        throw new Error("expected the consumption to fail");
      },
      (error: unknown) => error,
    );
  }

  function notificationsOf(
    who: Readonly<{ accountId: AccountId }>,
  ): Promise<readonly Notification[]> {
    return base.unitOfWorkProvider
      .run(({ notificationRepository }) =>
        notificationRepository.findByRecipient(who.accountId, FAR),
      )
      .then((page) => page.items);
  }

  const mailsTo = (who: Readonly<{ email: string }> | string) =>
    mailer.sentTo(typeof who === "string" ? who : who.email);

  async function storedEventCount(): Promise<number> {
    return (await t.storedEvents()).length;
  }

  const unregisteredEmail = (label = "nobody"): EmailAddress =>
    EmailAddress.create(`${label}-${idGenerator.next().slice(-6)}@example.com`);

  return {
    t,
    container,
    directory,
    mailer,
    clock,
    tick,
    person,
    place,
    region,
    occasion,
    applicationId,
    invitationId,
    appoint,
    removeSteward,
    operators,
    editors,
    withdraw,
    event,
    consume,
    consumeFailing,
    notificationsOf,
    mailsTo,
    storedEventCount,
    unregisteredEmail,
  };
}
