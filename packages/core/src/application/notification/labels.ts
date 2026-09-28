import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type {
  AccountId,
  ApplicationId,
  CategoryId,
  InfoReportId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import type { ContentDirectory } from "@repo/core/domain/moderation/ports/contentDirectory";
import { InfoReportTarget } from "@repo/core/domain/moderation/values";
import type {
  ApplicationLabel,
  RefLabel,
} from "@repo/core/domain/notification/mail";
import {
  type Occurrence,
  OccurrenceRef,
  Occurrence as Occurrences,
} from "@repo/core/domain/notification/occurrence";
import { findAccountsByIds } from "../authority/accounts";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import {
  type PendingApplicationLabel,
  readApplicationLabels,
} from "./applicationLabels";

/**
 * What the repositories answered for an occurrence's references, read
 * inside the unit of work. Content names are still missing: they come from
 * `ContentDirectory`, outside `run`, in `resolveLabels`.
 */
export type RepositoryLabels = Readonly<{
  accounts: ReadonlyMap<AccountId, EmailAddress>;
  applications: ReadonlyMap<ApplicationId, PendingApplicationLabel>;
  /** The names of the referenced categories found in the catalog. */
  categories: ReadonlyMap<CategoryId, string>;
  /** The category catalog, when a category is referenced; else `null`. */
  catalog: CategoryCatalog | null;
  /** The targets of the referenced takedown claims that exist. */
  claimTargets: ReadonlyMap<TakedownClaimId, ContentRef>;
  /** The targets of the referenced info reports that exist. */
  reportTargets: ReadonlyMap<InfoReportId, ContentRef>;
  /** Every content ref whose name the directory must resolve. */
  contents: readonly ContentRef[];
}>;

/** Every name the occurrences' labels need, resolved. */
export type LabelBook = Readonly<{
  accounts: ReadonlyMap<AccountId, EmailAddress>;
  applications: ReadonlyMap<ApplicationId, ApplicationLabel>;
  categories: ReadonlyMap<CategoryId, string>;
  claimTargets: ReadonlyMap<TakedownClaimId, ContentRef>;
  reportTargets: ReadonlyMap<InfoReportId, ContentRef>;
  contents: ReadonlyMap<string, string | null>;
}>;

function distinctRefs(occurrences: readonly Occurrence[]) {
  const refs = new Map<string, OccurrenceRef>();
  for (const o of occurrences) {
    for (const ref of Occurrences.refsOf(o)) {
      refs.set(OccurrenceRef.key(ref), ref);
    }
  }
  return [...refs.values()];
}

async function readCategories(
  ctx: UnitOfWorkContext,
  ids: readonly CategoryId[],
): Promise<
  Readonly<{
    catalog: CategoryCatalog | null;
    names: ReadonlyMap<CategoryId, string>;
  }>
> {
  const names = new Map<CategoryId, string>();
  if (ids.length === 0) return { catalog: null, names };
  const catalog = (await ctx.categoryCatalogRepository.find()).entity;
  for (const id of ids) {
    const category = CategoryCatalog.find(catalog, id);
    if (category !== undefined) names.set(id, category.name);
  }
  return { catalog, names };
}

async function readClaimTargets(
  ctx: UnitOfWorkContext,
  ids: readonly TakedownClaimId[],
): Promise<ReadonlyMap<TakedownClaimId, ContentRef>> {
  const targets = new Map<TakedownClaimId, ContentRef>();
  for (const id of ids) {
    const found = await ctx.takedownClaimRepository.findById(id);
    if (found !== null) targets.set(id, found.entity.ground.target);
  }
  return targets;
}

async function readReportTargets(
  ctx: UnitOfWorkContext,
  ids: readonly InfoReportId[],
): Promise<ReadonlyMap<InfoReportId, ContentRef>> {
  const targets = new Map<InfoReportId, ContentRef>();
  for (const id of ids) {
    const found = await ctx.infoReportRepository.findById(id);
    if (found !== null) {
      targets.set(id, InfoReportTarget.contentRef(found.entity.target));
    }
  }
  return targets;
}

/**
 * Reads, inside `run`, what the repositories hold for the occurrences'
 * references: accounts' addresses (`AccountRepository.findByIds`),
 * applications (`ApplicationRepository.findByIds`), categories' names
 * (`CategoryCatalogRepository.find`) and the targets of takedown claims and
 * info reports (`findById`), whose names `ContentDirectory` resolves.
 */
export async function readRepositoryLabels(
  ctx: UnitOfWorkContext,
  occurrences: readonly Occurrence[],
): Promise<RepositoryLabels> {
  const refs = distinctRefs(occurrences);
  const accountIds: AccountId[] = [];
  const applicationIds: ApplicationId[] = [];
  const categoryIds: CategoryId[] = [];
  const claimIds: TakedownClaimId[] = [];
  const reportIds: InfoReportId[] = [];
  const contents: ContentRef[] = [];
  for (const ref of refs) {
    switch (ref.kind) {
      case "account":
        accountIds.push(ref.id);
        break;
      case "application":
        applicationIds.push(ref.id);
        break;
      case "category":
        categoryIds.push(ref.id);
        break;
      case "takedownClaim":
        claimIds.push(ref.id);
        break;
      case "infoReport":
        reportIds.push(ref.id);
        break;
      default:
        contents.push(ref);
    }
  }
  const [accounts, applications, categories, claimTargets, reportTargets] =
    await Promise.all([
      findAccountsByIds(ctx.accountRepository, accountIds),
      readApplicationLabels(ctx, applicationIds),
      readCategories(ctx, categoryIds),
      readClaimTargets(ctx, claimIds),
      readReportTargets(ctx, reportIds),
    ]);
  const applicationContents = [...applications.values()].flatMap((label) =>
    label.subjects.flatMap((subject) =>
      subject.name.from === "directory" ? [subject.ref] : [],
    ),
  );
  return {
    accounts: new Map(
      [...accounts.values()].map((account) => [account.id, account.email]),
    ),
    applications,
    categories: categories.names,
    catalog: categories.catalog,
    claimTargets,
    reportTargets,
    contents: [
      ...contents,
      ...applicationContents,
      ...claimTargets.values(),
      ...reportTargets.values(),
    ],
  };
}

/**
 * Content names through `ContentDirectory.describe`, 100 at a time,
 * whether viewers can see the content or not. Called outside `run`.
 */
export async function describeContents(
  directory: ContentDirectory,
  refs: readonly ContentRef[],
): Promise<ReadonlyMap<string, string | null>> {
  const unique = [
    ...new Map(refs.map((ref) => [ContentRef.key(ref), ref])).values(),
  ];
  const names = new Map<string, string | null>();
  for (let start = 0; start < unique.length; start += IdBatch.maxSize) {
    const batch = unique.slice(start, start + IdBatch.maxSize);
    for (const summary of await directory.describe(batch)) {
      names.set(ContentRef.key(summary.target), summary.name);
    }
  }
  return names;
}

/** Completes the repositories' answers with content names (outside `run`). */
export async function resolveLabels(
  directory: ContentDirectory,
  read: RepositoryLabels,
): Promise<LabelBook> {
  const contents = await describeContents(directory, read.contents);
  const applications = new Map<ApplicationId, ApplicationLabel>();
  for (const [id, pending] of read.applications) {
    applications.set(id, {
      applicationKind: pending.applicationKind,
      subjects: pending.subjects.map((subject) => ({
        kind: subject.kind,
        name:
          subject.name.from === "content"
            ? subject.name.value
            : (contents.get(ContentRef.key(subject.ref)) ?? null),
      })),
    });
  }
  return {
    accounts: read.accounts,
    applications,
    categories: read.categories,
    claimTargets: read.claimTargets,
    reportTargets: read.reportTargets,
    contents,
  };
}

const nameOf = (book: LabelBook, target: ContentRef | undefined) =>
  target === undefined
    ? null
    : (book.contents.get(ContentRef.key(target)) ?? null);

/**
 * The occurrence's references with their names, in `Occurrence.refsOf`
 * order; a reference to something gone is labelled `null`. A takedown
 * claim or an info report is named after its target.
 */
export function labelsOf(o: Occurrence, book: LabelBook): readonly RefLabel[] {
  return Occurrences.refsOf(o).map((ref): RefLabel => {
    switch (ref.kind) {
      case "application":
        return { ref, label: book.applications.get(ref.id) ?? null };
      case "account":
        return { ref, label: book.accounts.get(ref.id) ?? null };
      case "category":
        return { ref, label: book.categories.get(ref.id) ?? null };
      case "takedownClaim":
        return { ref, label: nameOf(book, book.claimTargets.get(ref.id)) };
      case "infoReport":
        return { ref, label: nameOf(book, book.reportTargets.get(ref.id)) };
      default:
        return { ref, label: nameOf(book, ref) };
    }
  });
}
