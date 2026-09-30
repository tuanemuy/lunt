import { Account } from "@repo/core/domain/account/entity";
import { Article, type ArticleStatus } from "@repo/core/domain/article/article";
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
  ArticleId,
  CategoryId,
  InfoReportId,
  InvitationId,
  ListingId,
  OccasionId,
  PhotoId,
  PlaceId,
  RegionId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import type {
  ContentRef,
  ShowcaseRef,
  StewardedRef,
} from "@repo/core/domain/common/refs";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import { ListingContent } from "@repo/core/domain/listing/content";
import { Listing } from "@repo/core/domain/listing/listing";
import { Offering } from "@repo/core/domain/listing/offering";
import { CategoryName, ListingName } from "@repo/core/domain/listing/values";
import { InfoReport } from "@repo/core/domain/moderation/infoReport";
import { TakedownClaim } from "@repo/core/domain/moderation/takedownClaim";
import type { InfoReportTarget } from "@repo/core/domain/moderation/values";
import type { NotifiableEvent } from "@repo/core/domain/notification/announcement";
import type { Notification } from "@repo/core/domain/notification/notification";
import {
  Participation,
  ParticipationDetails,
} from "@repo/core/domain/occasion/participation";
import { Place } from "@repo/core/domain/place/place";
import { sampleProfile } from "@repo/core/domain/place/testing/samples";
import { expect } from "vitest";
import {
  createTestContainer,
  type TestContext,
} from "../../__tests__/testContainer";
import { removeAllAuthorityOf } from "../../authority/withdrawal";
import type { RequestContainer } from "../../di/types";
import { TestContentDirectory } from "../../moderation/__tests__/testServices";
import { suspendPlace as suspendPlaceUsecase } from "../../place/suspendPlace";
import { deliverNotifications } from "../deliverNotifications";
import { TestMailer } from "./testServices";

/** A registered account and its `Actor`. */
export type Person = Appointee & Readonly<{ actor: Actor }>;

export type Kit = ReturnType<typeof notificationKit>;

const FAR = { page: 1, limit: 100 } as const;

/**
 * Usecase-test kit for Notification: the production-shaped test container
 * with a test `ContentDirectory` (targets and names a test sets, regions
 * and occasions included before their stage stores them) — or, with
 * `realDirectory`, the production one over the stored content — and a
 * `TestMailer`, preconditions written straight through
 * the repositories (no events), and readers for what was delivered.
 */
export function notificationKit(
  options: Readonly<{
    overrides?: (container: RequestContainer) => Partial<RequestContainer>;
    realDirectory?: boolean;
  }> = {},
) {
  const directory = new TestContentDirectory();
  const mailer = new TestMailer();
  const t: TestContext = createTestContainer({
    overrides: () =>
      options.realDirectory
        ? { mailer }
        : { contentDirectory: directory, mailer },
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
  /** A place stored in the place repository (viewable), named in the directory. */
  async function registeredPlace(name = "店舗"): Promise<PlaceRef> {
    const ref: PlaceRef = {
      kind: "place",
      id: PlaceId.create(idGenerator.next()),
    };
    const { entity } = Place.register(
      { id: ref.id, profile: sampleProfile({ name }) },
      tick(),
    );
    await base.unitOfWorkProvider.run(({ placeRepository }) =>
      placeRepository.insert(entity),
    );
    directory.add(ref, name);
    return ref;
  }

  /** `operator` suspends a stored place through Place's usecase. */
  async function suspendPlace(place: PlaceRef, operator: Person) {
    await suspendPlaceUsecase({
      container: base,
      actor: operator.actor,
      input: { placeId: place.id },
    });
  }

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

  /** `places` take part in `occasion`, stored directly (no events). */
  async function participate(
    occasion: Extract<StewardedRef, { kind: "occasion" }>,
    ...places: readonly PlaceRef[]
  ): Promise<void> {
    await base.unitOfWorkProvider.run(async ({ participationRepository }) => {
      for (const place of places) {
        await participationRepository.insert(
          Participation.establish(
            {
              key: { occasionId: occasion.id, placeId: place.id },
              details: ParticipationDetails.empty(),
            },
            tick(),
          ).entity,
        );
      }
    });
  }

  /**
   * A draft listing of `place` written straight through the repository
   * (its stored `categoryId` as given, even a retired one), named in the
   * directory.
   */
  async function listing(
    place: PlaceRef,
    spec: Readonly<{ name?: string | null; categoryId?: CategoryId }> = {},
  ): Promise<Extract<ContentRef, { kind: "listing" }>> {
    const id = ListingId.create(idGenerator.next());
    const name = spec.name === undefined ? "掲載" : spec.name;
    const { entity } = Listing.createDraft(
      {
        id,
        placeId: place.id,
        content: {
          name: name === null ? null : ListingName.create(name),
          description: null,
          categoryId: null,
          photos: PhotoSet.of([], "LISTING"),
          offering: Offering.none(),
        },
      },
      CategoryCatalog.empty(),
      tick(),
    );
    const stored = {
      ...entity,
      content: { ...entity.content, categoryId: spec.categoryId ?? null },
    };
    await base.unitOfWorkProvider.run(({ listingRepository }) =>
      listingRepository.insert(stored),
    );
    const ref = { kind: "listing", id } as const;
    directory.add(ref, name);
    return ref;
  }

  /**
   * A published listing of `place` with one photo, written straight
   * through the repository (the catalog gets a category when it has
   * none), named in the directory with its photo.
   */
  async function publishedListing(
    place: PlaceRef,
    name = "掲載",
  ): Promise<
    Readonly<{
      ref: Extract<ContentRef, { kind: "listing" }>;
      photoId: PhotoId;
    }>
  > {
    const readCatalog = () =>
      base.unitOfWorkProvider
        .run(({ categoryCatalogRepository }) =>
          categoryCatalogRepository.find(),
        )
        .then((read) => read.entity);
    const [active] = CategoryCatalog.actives(await readCatalog());
    const categoryId = active?.id ?? (await categories("食べる"))[0];
    if (categoryId === undefined) throw new Error("no category");
    const catalog = await readCatalog();
    const id = ListingId.create(idGenerator.next());
    const photoId = PhotoId.create(idGenerator.next());
    const { entity } = Listing.createPublished(
      {
        id,
        placeId: place.id,
        content: ListingContent.toPublishable({
          name: ListingName.create(name),
          description: null,
          categoryId,
          photos: PhotoSet.of([{ photoId, framing: null }], "LISTING"),
          offering: Offering.none(),
        }),
      },
      catalog,
      tick(),
    );
    await base.unitOfWorkProvider.run(({ listingRepository }) =>
      listingRepository.insert(entity),
    );
    const ref = { kind: "listing", id } as const;
    directory.add(ref, name, [photoId]);
    return { ref, photoId };
  }

  /**
   * An article with one photo showcasing `showcases`, written straight
   * through the repository (no events) in `status` (default `published`;
   * `unpublished` is an editor's unpublish), named in the directory by its
   * title.
   */
  async function article(
    showcases: readonly ShowcaseRef[],
    spec: Readonly<{ status?: ArticleStatus; title?: string }> = {},
  ): Promise<Extract<ContentRef, { kind: "article" }>> {
    const id = ArticleId.create(idGenerator.next());
    const title = spec.title ?? "読みもの";
    const { entity } = Article.create(
      {
        id,
        content: {
          title,
          body: "本文",
          photoIds: [PhotoId.create(idGenerator.next())],
          showcases,
        },
      },
      tick(),
    );
    const status = spec.status ?? "published";
    const published =
      status === "draft" ? null : Article.publish(entity, tick());
    const stored =
      published === null
        ? entity
        : status === "unpublished"
          ? Article.unpublish(published, tick())
          : published;
    await base.unitOfWorkProvider.run(({ articleRepository }) =>
      articleRepository.insert(stored),
    );
    const ref = { kind: "article", id } as const;
    directory.add(ref, title);
    return ref;
  }

  async function writeCatalog(
    change: (current: CategoryCatalog) => CategoryCatalog,
  ): Promise<void> {
    await base.unitOfWorkProvider.run(async ({ categoryCatalogRepository }) => {
      const read = await categoryCatalogRepository.find();
      await categoryCatalogRepository.save(
        change(read.entity),
        read.expectedVersion,
      );
    });
  }

  /** Establishes (first call) or extends the catalog with active categories. */
  async function categories(
    ...names: readonly [string, ...string[]]
  ): Promise<readonly CategoryId[]> {
    const added = names.map((name) => ({
      id: CategoryId.create(idGenerator.next()),
      name: CategoryName.create(name),
    }));
    await writeCatalog((current) => {
      if (CategoryCatalog.isEmpty(current)) {
        const [first, ...rest] = added;
        if (first === undefined) return current;
        return CategoryCatalog.establish(current, [first, ...rest], tick())
          .entity;
      }
      return added.reduce(
        (catalog, category) =>
          CategoryCatalog.add(catalog, category, tick()).entity,
        current,
      );
    });
    return added.map((category) => category.id);
  }

  const retireCategory = (id: CategoryId, successorId: CategoryId) =>
    writeCatalog(
      (current) =>
        CategoryCatalog.retire(current, id, successorId, tick()).entity,
    );

  const renameCategory = (id: CategoryId, name: string) =>
    writeCatalog(
      (current) =>
        CategoryCatalog.rename(current, id, CategoryName.create(name), tick())
          .entity,
    );

  /** An open takedown claim on `target` from `email`, stored directly. */
  async function takedownClaim(
    target: ContentRef,
    email = "claimant@example.com",
  ): Promise<TakedownClaimId> {
    const id = TakedownClaimId.create(idGenerator.next());
    const photoId = PhotoId.create(idGenerator.next());
    const { entity } = TakedownClaim.submit(
      {
        id,
        standing: "photoRightsHolder",
        target,
        photoIds: [photoId],
        reason: "写真の権利を侵害しています",
        email,
      },
      { viewable: true, photoIds: [photoId] },
      tick(),
    );
    await base.unitOfWorkProvider.run(({ takedownClaimRepository }) =>
      takedownClaimRepository.insert(entity),
    );
    return id;
  }

  /** Resolves a stored claim with `outcome` (no event is stored). */
  async function resolveClaim(
    id: TakedownClaimId,
    outcome: string,
  ): Promise<void> {
    await base.unitOfWorkProvider.run(async ({ takedownClaimRepository }) => {
      const found = await takedownClaimRepository.findById(id);
      if (found === null) throw new Error("no claim");
      await takedownClaimRepository.save(
        TakedownClaim.resolve(found.entity, outcome, tick()).entity,
        found.expectedVersion,
      );
    });
  }

  /** An open info report on `target` from `reporter`, stored directly. */
  async function infoReport(
    target: InfoReportTarget,
    reporter: Person,
  ): Promise<InfoReportId> {
    const id = InfoReportId.create(idGenerator.next());
    const { entity } = InfoReport.submit(
      {
        id,
        target:
          target.kind === "place"
            ? target
            : { kind: "listing", listingId: target.listingId },
        category: "incorrectInfo",
        content: "営業時間が違います",
      },
      reporter.actor,
      { kind: "available", placeId: target.placeId, placeHasSteward: true },
      tick(),
    );
    await base.unitOfWorkProvider.run(({ infoReportRepository }) =>
      infoReportRepository.insert(entity),
    );
    return id;
  }
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
   * Consumes `e` as the relay would, through the registered consumer. It
   * only type-checks while the consumer subscribes to every notifiable
   * event type.
   */
  async function consume(e: NotifiableEvent): Promise<void> {
    tick();
    expect(deliverNotifications.events).toContain(e.type);
    await deliverNotifications.handle(container, e);
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
    registeredPlace,
    suspendPlace,
    region,
    occasion,
    applicationId,
    participate,
    listing,
    publishedListing,
    article,
    categories,
    retireCategory,
    renameCategory,
    takedownClaim,
    resolveClaim,
    infoReport,
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
