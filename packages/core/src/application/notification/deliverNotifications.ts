import { APPLICATION_EVENT_TYPES } from "@repo/core/domain/application/events";
import type {
  EditorRoster,
  OperatorRoster,
} from "@repo/core/domain/authority/roleRoster";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import { type AccountId, NotificationId } from "@repo/core/domain/common/ids";
import {
  type Addressees,
  Addressing,
  type AddressingFacts,
} from "@repo/core/domain/notification/addressing";
import {
  type Announcement,
  AnnouncementFacts,
  Announcements,
  type NotifiableEvent,
  type Origin,
} from "@repo/core/domain/notification/announcement";
import type { DeliveredOccurrence } from "@repo/core/domain/notification/delivery";
import {
  NotificationMail,
  type RefLabel,
} from "@repo/core/domain/notification/mail";
import { Notification } from "@repo/core/domain/notification/notification";
import { MailKey } from "@repo/core/domain/notification/occurrenceKey";
import { findAccountsByIds } from "../authority/accounts";
import type { RequestContainer } from "../di/types";
import { defineConsumer } from "../events/consumer";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import { labelsOf, readRepositoryLabels, resolveLabels } from "./labels";

/** One announcement with its recipients decided and its mail's labels named. */
export type PlannedAnnouncement = Readonly<{
  origin: Origin;
  delivered: DeliveredOccurrence;
  /**
   * Existing accounts addressed (notification + mail), in addressing
   * order; or an address without an account (mail only, invitations).
   */
  recipients:
    | Readonly<{
        kind: "accounts";
        accounts: readonly Readonly<{ id: AccountId; email: EmailAddress }>[];
      }>
    | Readonly<{ kind: "emailOnly"; email: EmailAddress }>;
  labels: readonly RefLabel[];
}>;

/**
 * Reads the facts each stage-1 event's announcements need — none. A later
 * stage's event that needs `AnnouncementFacts` (participating places, a
 * listing's place, the retired category's places, showcasing articles)
 * reads them here, inside the same read-only `run`.
 */
async function readAnnouncementFacts(
  _ctx: UnitOfWorkContext,
  _event: NotifiableEvent,
): Promise<AnnouncementFacts> {
  return AnnouncementFacts.none;
}

/** Both rosters, read once per consumption and only when first needed. */
function rosterReader(ctx: UnitOfWorkContext) {
  let operators: Promise<OperatorRoster> | null = null;
  let editors: Promise<EditorRoster> | null = null;
  return {
    operators: () => {
      operators ??= ctx.roleRosterRepository
        .find("operator")
        .then((found) => found.entity);
      return operators;
    },
    editors: () => {
      editors ??= ctx.roleRosterRepository
        .find("editor")
        .then((found) => found.entity);
      return editors;
    },
  };
}

async function addressingFactsFor(
  ctx: UnitOfWorkContext,
  a: Announcement,
  rosters: ReturnType<typeof rosterReader>,
): Promise<AddressingFacts> {
  const audience = Addressing.audienceOf(a);
  const [stewardship, operators, editors, invitee] = await Promise.all([
    audience.kind === "stewards"
      ? ctx.stewardshipRepository
          .findById(audience.target)
          .then((found) => found?.entity ?? null)
      : null,
    rosters.operators(),
    rosters.editors(),
    audience.kind === "email"
      ? ctx.accountRepository.findByEmail(audience.email)
      : null,
  ]);
  return {
    stewardship,
    operators,
    editors,
    inviteeAccount: invitee?.entity.id ?? null,
  };
}

const addressedAccounts = (addressees: Addressees): readonly AccountId[] =>
  addressees.to.kind === "accounts" ? addressees.to.accountIds : [];

/**
 * Turns the event into announcements and decides their recipients and
 * labels. One read-only `run` reads every fact at consumption time — the
 * current stewards and rosters, never the payload's before/after — and the
 * recipients' addresses; content names are read after it, outside `run`.
 * Accounts that no longer exist drop out of the recipients.
 */
export async function planAnnouncements(
  container: RequestContainer,
  event: NotifiableEvent,
): Promise<readonly PlannedAnnouncement[]> {
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const announcements = Announcements.from(
      event,
      await readAnnouncementFacts(ctx, event),
    );
    const rosters = rosterReader(ctx);
    const addressed = await Promise.all(
      announcements.map(async (a) => ({
        origin: a.origin,
        addressees: Addressing.resolve(
          a,
          await addressingFactsFor(ctx, a, rosters),
        ),
      })),
    );
    const [accounts, labels] = await Promise.all([
      findAccountsByIds(
        ctx.accountRepository,
        addressed.flatMap(({ addressees }) => addressedAccounts(addressees)),
      ),
      readRepositoryLabels(
        ctx,
        addressed.map(({ addressees }) => addressees.delivered.occurrence),
      ),
    ]);
    return { addressed, accounts, labels };
  });
  const book = await resolveLabels(container.contentDirectory, read.labels);
  return read.addressed.map(({ origin, addressees }): PlannedAnnouncement => {
    const { delivered, to } = addressees;
    const labels = labelsOf(delivered.occurrence, book);
    if (to.kind === "emailOnly") {
      return {
        origin,
        delivered,
        recipients: { kind: "emailOnly", email: to.email },
        labels,
      };
    }
    return {
      origin,
      delivered,
      recipients: {
        kind: "accounts",
        accounts: to.accountIds.flatMap((id) => {
          const account = read.accounts.get(id);
          return account === undefined ? [] : [{ id, email: account.email }];
        }),
      },
      labels,
    };
  });
}

function failure(errors: readonly unknown[], message: string): unknown {
  return errors.length === 1 ? errors[0] : new AggregateError(errors, message);
}

async function findDispatched(
  container: RequestContainer,
  keys: readonly MailKey[],
): Promise<ReadonlySet<string>> {
  const dispatched = new Set<string>();
  if (keys.length === 0) return dispatched;
  await container.unitOfWorkProvider.run(async ({ mailDispatchLedger }) => {
    for (let start = 0; start < keys.length; start += IdBatch.maxSize) {
      const batch = keys.slice(start, start + IdBatch.maxSize);
      for (const key of await mailDispatchLedger.findDispatched(batch)) {
        dispatched.add(MailKey.key(key));
      }
    }
  });
  return dispatched;
}

/**
 * Records one announcement's notifications (one `run`), then mails every
 * recipient without a dispatch record: render and send outside `run`, and
 * record each accepted send in a `run` of its own. A failed send does not
 * stop the others; any failure is thrown once all were tried.
 */
async function deliverAnnouncement(
  container: RequestContainer,
  planned: PlannedAnnouncement,
): Promise<void> {
  const { origin, delivered, recipients, labels } = planned;
  const addresses =
    recipients.kind === "emailOnly"
      ? [recipients.email]
      : recipients.accounts.map((account) => account.email);
  if (recipients.kind === "accounts" && recipients.accounts.length > 0) {
    const now = container.clock.now();
    const notifications = recipients.accounts.map((account) =>
      Notification.issue(
        {
          id: NotificationId.create(container.idGenerator.next()),
          origin,
          delivered,
          recipient: account.id,
        },
        now,
      ),
    );
    await container.unitOfWorkProvider.run(({ notificationRepository }) =>
      notificationRepository.deliverAll(notifications),
    );
  }
  const mails = addresses.map((to) =>
    NotificationMail.compose(origin, delivered, to, labels),
  );
  const dispatched = await findDispatched(
    container,
    mails.map((mail) => mail.key),
  );
  const errors: unknown[] = [];
  for (const mail of mails) {
    if (dispatched.has(MailKey.key(mail.key))) continue;
    try {
      await container.mailer.send(
        container.notificationMailRenderer.render(mail),
      );
      await container.unitOfWorkProvider.run(({ mailDispatchLedger }) =>
        mailDispatchLedger.record(mail.key),
      );
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw failure(errors, "Some notification mails could not be sent");
  }
}

/**
 * Delivers planned announcements one by one; a failed one does not stop
 * the rest, and the whole consumption fails once all were tried — the
 * relay redelivers, and the idempotent writes make the retry send only
 * what is still missing.
 */
export async function deliverAnnouncements(
  container: RequestContainer,
  planned: readonly PlannedAnnouncement[],
): Promise<void> {
  const errors: unknown[] = [];
  for (const announcement of planned) {
    try {
      await deliverAnnouncement(container, announcement);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw failure(errors, "Some notifications could not be delivered");
  }
}

/**
 * `deliverNotifications` for any notifiable event (P-90, B-39): announce,
 * address at consumption time, record the in-app notifications, then mail
 * every recipient. Redelivery is safe: the same announcement keeps its
 * `occurrenceKey`, so notifications are not duplicated and mails with a
 * dispatch record are not resent. Emits no domain event.
 */
export async function deliverNotificationsOf(
  container: RequestContainer,
  event: NotifiableEvent,
): Promise<void> {
  await deliverAnnouncements(
    container,
    await planAnnouncements(container, event),
  );
}

/**
 * The `deliverNotifications` consumer (`spec/usecases/notification.md`).
 * Later stages add their events with their `NotifiableEvent` members.
 */
export const deliverNotifications = defineConsumer(
  [
    "authority.invitation_issued",
    "authority.steward_appointed",
    "authority.steward_removed",
    "authority.role_granted",
    "authority.role_revoked",
    ...APPLICATION_EVENT_TYPES,
  ],
  (container, event) => deliverNotificationsOf(container, event),
);
