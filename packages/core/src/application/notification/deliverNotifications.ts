import { APPLICATION_EVENT_TYPES } from "@repo/core/domain/application/events";
import type { Role } from "@repo/core/domain/authority/role";
import {
  type EditorRoster,
  type OperatorRoster,
  RoleRoster,
} from "@repo/core/domain/authority/roleRoster";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import {
  type AccountId,
  type CategoryId,
  NotificationId,
  type OccasionId,
  type PlaceId,
} from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import {
  Addressing,
  type AddressingFacts,
  type Audience,
} from "@repo/core/domain/notification/addressing";
import {
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
import { PLACE_EVENT_TYPES } from "@repo/core/domain/place/events";
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
 * The places holding a listing whose stored category is the retired one
 * or reaches it (`CategoryCatalog.predecessorsOf`), in any state, without
 * duplicates.
 */
async function placesOfRetiredCategory(
  ctx: UnitOfWorkContext,
  categoryId: CategoryId,
): Promise<readonly PlaceId[]> {
  const catalog = (await ctx.categoryCatalogRepository.find()).entity;
  const categoryIds = CategoryCatalog.predecessorsOf(catalog, categoryId);
  const places = new Set<PlaceId>();
  let seen = 0;
  for (let page = 1; ; page += 1) {
    const { items, count } = await ctx.listingRepository.findPageByCategories(
      categoryIds,
      { page, limit: IdBatch.maxSize },
    );
    for (const listing of items) places.add(listing.placeId);
    seen += items.length;
    if (items.length === 0 || seen >= count) return [...places];
  }
}

/**
 * The places taking part in the occasion, in any state, every page read
 * (`ParticipationRepository.findByOccasion`).
 */
async function participatingPlaces(
  ctx: UnitOfWorkContext,
  occasionId: OccasionId,
): Promise<readonly PlaceId[]> {
  const places = new Set<PlaceId>();
  let seen = 0;
  for (let page = 1; ; page += 1) {
    const { items, count } = await ctx.participationRepository.findByOccasion(
      occasionId,
      {
        page,
        limit: IdBatch.maxSize,
      },
    );
    for (const participation of items) places.add(participation.key.placeId);
    seen += items.length;
    if (items.length === 0 || seen >= count) return [...places];
  }
}

/**
 * Reads the facts the event's announcements need (`AnnouncementFacts`),
 * inside the read-only `run`. The published articles showcasing what an
 * event changed come from Article's repository, which lands in stage 5;
 * until then no article showcases anything, and a place's listings (the
 * candidates of its suspension or closure) need not be read.
 */
async function readAnnouncementFacts(
  ctx: UnitOfWorkContext,
  event: NotifiableEvent,
): Promise<AnnouncementFacts> {
  switch (event.type) {
    case "content.photos_taken_down": {
      const { owner } = event.payload;
      if (owner.kind !== "listing") return AnnouncementFacts.none;
      const found = await ctx.listingRepository.findById(owner.id);
      return {
        ...AnnouncementFacts.none,
        ownerListingPlace: found?.entity.placeId ?? null,
      };
    }
    case "category.retired":
      return {
        ...AnnouncementFacts.none,
        placesOfRetiredCategory: await placesOfRetiredCategory(
          ctx,
          event.payload.categoryId,
        ),
      };
    case "occasion.cancelled":
    case "occasion.period_changed":
      return {
        ...AnnouncementFacts.none,
        participatingPlaces: await participatingPlaces(
          ctx,
          event.payload.occasionId,
        ),
      };
    default:
      return AnnouncementFacts.none;
  }
}

/**
 * What the read-only `run` read for addressing: the stewardships of the
 * `stewards` audiences (`null`: none stored), the rosters the audiences
 * need (`null`: not needed), and the invitees' accounts.
 */
type AddressingReads = Readonly<{
  stewardships: ReadonlyMap<string, Stewardship | null>;
  operators: OperatorRoster | null;
  editors: EditorRoster | null;
  invitees: ReadonlyMap<EmailAddress, AccountId>;
}>;

/**
 * Reads, at consumption time, the facts the audiences need — the current
 * stewards and rosters, never the payload's before/after. A roster is read
 * only when an audience can reach it: the operators for an operator role
 * or a vacant target's stand-ins, the editors for the editor role.
 */
async function readAddressingFacts(
  ctx: UnitOfWorkContext,
  audiences: readonly Audience[],
): Promise<AddressingReads> {
  const stewardships = new Map<string, Stewardship | null>();
  const invitees = new Map<EmailAddress, AccountId>();
  for (const audience of audiences) {
    if (audience.kind === "stewards") {
      const found = await ctx.stewardshipRepository.findById(audience.target);
      stewardships.set(ContentRef.key(audience.target), found?.entity ?? null);
    } else if (audience.kind === "email") {
      const found = await ctx.accountRepository.findByEmail(audience.email);
      if (found !== null) invitees.set(audience.email, found.entity.id);
    }
  }
  const needsRole = (role: Role) =>
    audiences.some((a) => a.kind === "role" && a.role === role);
  const needsOperators =
    needsRole("operator") ||
    [...stewardships.values()].some(
      (s) => s === null || Stewardship.isVacant(s),
    );
  const [operators, editors] = await Promise.all([
    needsOperators
      ? ctx.roleRosterRepository.find("operator").then((f) => f.entity)
      : null,
    needsRole("editor")
      ? ctx.roleRosterRepository.find("editor").then((f) => f.entity)
      : null,
  ]);
  return { stewardships, operators, editors, invitees };
}

/** Every account the read facts could address: the addresses to read. */
function candidateAccounts(
  audiences: readonly Audience[],
  reads: AddressingReads,
): readonly AccountId[] {
  return [
    ...audiences.flatMap((a) => (a.kind === "account" ? [a.accountId] : [])),
    ...[...reads.stewardships.values()].flatMap((s) =>
      s === null ? [] : Stewardship.stewards(s).map((st) => st.accountId),
    ),
    ...[reads.operators, reads.editors].flatMap((roster) =>
      roster === null
        ? []
        : RoleRoster.holders(roster).map((holder) => holder.accountId),
    ),
    ...reads.invitees.values(),
  ];
}

/** The facts `Addressing.resolve` takes for one announcement. */
function addressingFactsFor(
  audience: Audience,
  reads: AddressingReads,
): AddressingFacts {
  return {
    stewardship:
      audience.kind === "stewards"
        ? (reads.stewardships.get(ContentRef.key(audience.target)) ?? null)
        : null,
    // A roster left unread is one no audience of this event can reach, so
    // `resolve` never consults the stand-in.
    operators: reads.operators ?? RoleRoster.initial("operator"),
    editors: reads.editors ?? RoleRoster.initial("editor"),
    inviteeAccount:
      audience.kind === "email"
        ? (reads.invitees.get(audience.email) ?? null)
        : null,
  };
}

/**
 * Turns the event into announcements and decides their recipients and
 * labels (`spec/usecases/notification.md` 「トランザクション境界」). One
 * read-only `run` reads the facts: those the announcements need, those
 * their audiences need, the candidates' addresses and the repositories'
 * labels. The announcements are taken there only to know what to read;
 * extraction and addressing are decided after the `run`, from what it
 * read, and content names are read after it too. Accounts that no longer
 * exist drop out of the recipients.
 */
export async function planAnnouncements(
  container: RequestContainer,
  event: NotifiableEvent,
): Promise<readonly PlannedAnnouncement[]> {
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const facts = await readAnnouncementFacts(ctx, event);
    const toRead = Announcements.from(event, facts);
    const audiences = toRead.map(Addressing.audienceOf);
    const addressing = await readAddressingFacts(ctx, audiences);
    const [accounts, labels] = await Promise.all([
      findAccountsByIds(
        ctx.accountRepository,
        candidateAccounts(audiences, addressing),
      ),
      readRepositoryLabels(
        ctx,
        toRead.map((a) => a.occurrence),
      ),
    ]);
    return { facts, addressing, accounts, labels };
  });
  const addressed = Announcements.from(event, read.facts).map((a) => ({
    origin: a.origin,
    addressees: Addressing.resolve(
      a,
      addressingFactsFor(Addressing.audienceOf(a), read.addressing),
    ),
  }));
  const book = await resolveLabels(container.contentDirectory, read.labels);
  return addressed.map(({ origin, addressees }): PlannedAnnouncement => {
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
 * The `deliverNotifications` consumer (`spec/usecases/notification.md`),
 * subscribed to every `NotifiableEvent` type.
 */
export const deliverNotifications = defineConsumer(
  [
    "authority.invitation_issued",
    "authority.steward_appointed",
    "authority.steward_removed",
    "authority.role_granted",
    "authority.role_revoked",
    ...APPLICATION_EVENT_TYPES,
    ...PLACE_EVENT_TYPES,
    "listing.suspended",
    "listing.unsuspended",
    "listing.unpublished",
    "listing.deleted",
    "listing.offering_ended",
    "category.retired",
    "content.photos_taken_down",
    "takedown_claim.submitted",
    "info_report.submitted",
    "info_report.confirmation_requested",
    "region.unpublished",
    "region.suspended",
    "region.unsuspended",
    "region.affiliation_dissolved",
    "occasion.period_changed",
    "occasion.unpublished",
    "occasion.cancelled",
    "occasion.ended",
    "occasion.suspended",
    "occasion.unsuspended",
    "occasion.participation_changed",
    "occasion.participation_dissolved",
    "occasion.region_linked",
    "occasion.region_link_detached",
  ],
  (container, event) => deliverNotificationsOf(container, event),
);
