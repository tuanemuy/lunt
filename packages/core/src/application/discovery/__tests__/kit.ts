import {
  type DiscoveryHarness,
  discoveryWorld,
} from "@repo/core/adapters/do/__conformance__/discoveryFixtures";
import { Account } from "@repo/core/domain/account/entity";
import {
  type GrantableRef,
  type PlaceRef,
  Stewardship,
} from "@repo/core/domain/authority/stewardship";
import type { Actor } from "@repo/core/domain/common/actor";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import {
  type CategoryId,
  InvitationId,
  type PlaceId,
} from "@repo/core/domain/common/ids";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import { CategoryName } from "@repo/core/domain/listing/values";
import { expect } from "vitest";
import {
  createTestContainer,
  type TestContainerOptions,
} from "../../__tests__/testContainer";
import { NotFoundError } from "../../errors";

export type Person = Readonly<{ actor: Actor; email: EmailAddress }>;

/** 2026-07-10 in Japan — the listing fixtures' `TODAY`. */
export const KIT_NOW = "2026-07-10T03:00:00.000Z";

/**
 * Usecase-test kit for Discovery: the production-shaped test container,
 * places and listings stored through their repositories
 * (`discoveryWorld`), a category catalog holding the fixtures' default
 * category, and stewards written straight through the repository.
 */
export async function discoveryKit(options: TestContainerOptions = {}) {
  const t = createTestContainer({ start: KIT_NOW, ...options });
  const { container } = t;
  const harness: DiscoveryHarness = {
    uow: container.unitOfWorkProvider,
    savedEvents: t.storedEvents,
    detailQueries: container.detailQueries,
    referenceQueries: container.referenceQueries,
    explorationQueries: container.explorationQueries,
    keywordSearchQueries: container.keywordSearchQueries,
    feedCandidateQueries: container.feedCandidateQueries,
  };
  const w = discoveryWorld(harness);

  const categories = async (
    names: readonly string[],
  ): Promise<readonly CategoryId[]> => {
    const ids = [
      w.f.defaultCategory,
      ...names.slice(1).map(() => w.f.category()),
    ];
    await container.unitOfWorkProvider.run(
      async ({ categoryCatalogRepository }) => {
        const read = await categoryCatalogRepository.find();
        const [first, ...rest] = ids.map((id, i) => ({
          id,
          name: CategoryName.create(names[i] ?? `カテゴリー${i}`),
        }));
        if (first === undefined) throw new Error("a category");
        await categoryCatalogRepository.save(
          CategoryCatalog.establish(
            read.entity,
            [first, ...rest],
            t.clock.now(),
          ).entity,
          read.expectedVersion,
        );
      },
    );
    return ids;
  };
  const categoryIds = await categories(["食べる", "買う", "体験", "見る"]);

  let people = 0;
  /** A registered account and its `Actor`. */
  const person = async (): Promise<Person> => {
    people += 1;
    const account = Account.register({
      id: t.idGenerator.next(),
      email: `viewer${people}@example.com`,
    });
    await container.unitOfWorkProvider.run(({ accountRepository }) =>
      accountRepository.insert(account),
    );
    return { actor: { accountId: account.id }, email: account.email };
  };

  /** Stores `actor` as a steward of the place. */
  const appoint = async (placeId: PlaceId, who: Person): Promise<void> => {
    const target: PlaceRef = { kind: "place", id: placeId };
    await container.unitOfWorkProvider.run(
      async ({ stewardshipRepository }) => {
        const found = await stewardshipRepository.findById(target);
        const current = Stewardship.orVacant(found?.entity ?? null, target);
        const next = Stewardship.appointByApproval(
          current,
          { accountId: who.actor.accountId, email: who.email },
          t.clock.now(),
        ).entity;
        if (found === null) await stewardshipRepository.insert(next);
        else await stewardshipRepository.save(next, found.expectedVersion);
      },
    );
  };

  /** Stores `who` as a steward of the region or occasion (an operator's grant). */
  const grant = async (target: GrantableRef, who: Person): Promise<void> => {
    await container.unitOfWorkProvider.run(
      async ({ stewardshipRepository }) => {
        const found = await stewardshipRepository.findById(target);
        const next = Stewardship.grant(
          Stewardship.orVacant(found?.entity ?? null, target),
          { accountId: who.actor.accountId, email: who.email },
          t.clock.now(),
        ).entity;
        if (found === null) await stewardshipRepository.insert(next);
        else await stewardshipRepository.save(next, found.expectedVersion);
      },
    );
  };

  /** Stores a pending invitation of `who` to steward the place. */
  const invite = async (placeId: PlaceId, who: Person): Promise<void> => {
    const target: PlaceRef = { kind: "place", id: placeId };
    await container.unitOfWorkProvider.run(
      async ({ stewardshipRepository }) => {
        const found = await stewardshipRepository.findById(target);
        const next = Stewardship.invite(
          Stewardship.orVacant(found?.entity ?? null, target),
          {
            invitationId: InvitationId.create(t.idGenerator.next()),
            email: who.email,
          },
          who.actor.accountId,
          t.clock.now(),
        ).entity;
        if (found === null) await stewardshipRepository.insert(next);
        else await stewardshipRepository.save(next, found.expectedVersion);
      },
    );
  };

  /** Retires `id` in favour of `successor`. */
  const retireCategory = async (
    id: CategoryId,
    successor: CategoryId,
  ): Promise<void> => {
    await container.unitOfWorkProvider.run(
      async ({ categoryCatalogRepository }) => {
        const read = await categoryCatalogRepository.find();
        await categoryCatalogRepository.save(
          CategoryCatalog.retire(read.entity, id, successor, t.clock.now())
            .entity,
          read.expectedVersion,
        );
      },
    );
  };

  const catalog = () =>
    container.unitOfWorkProvider.run(({ categoryCatalogRepository }) =>
      categoryCatalogRepository.find(),
    );

  return {
    ...t,
    w,
    categoryIds,
    person,
    appoint,
    grant,
    invite,
    retireCategory,
    catalog,
  };
}

export type DiscoveryKit = Awaited<ReturnType<typeof discoveryKit>>;

/** Asserts `promise` rejects with a `NotFoundError` of `code`. */
export async function expectNotFound(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(NotFoundError);
  expect((error as NotFoundError).code).toBe(code);
}
