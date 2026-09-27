import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { AccountId, ApplicationId } from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import type { ContentDirectory } from "@repo/core/domain/moderation/ports/contentDirectory";
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
  /** Every content ref whose name the directory must resolve. */
  contents: readonly ContentRef[];
}>;

/** Every name the occurrences' labels need, resolved. */
export type LabelBook = Readonly<{
  accounts: ReadonlyMap<AccountId, EmailAddress>;
  applications: ReadonlyMap<ApplicationId, ApplicationLabel>;
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

/**
 * Reads, inside `run`, what the repositories hold for the occurrences'
 * references: accounts' addresses (`AccountRepository.findByIds`) and
 * applications (`ApplicationRepository.findByIds`). Category, takedown
 * claim and info report references come only from later stages'
 * occurrences; their readers (Listing's `CategoryCatalogRepository`,
 * Moderation's `TakedownClaimRepository` / `InfoReportRepository`) join
 * here with those stages, and until then they read as `null`.
 */
export async function readRepositoryLabels(
  ctx: UnitOfWorkContext,
  occurrences: readonly Occurrence[],
): Promise<RepositoryLabels> {
  const refs = distinctRefs(occurrences);
  const accountIds: AccountId[] = [];
  const applicationIds: ApplicationId[] = [];
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
      case "takedownClaim":
      case "infoReport":
        break;
      default:
        contents.push(ref);
    }
  }
  const [accounts, applications] = await Promise.all([
    findAccountsByIds(ctx.accountRepository, accountIds),
    readApplicationLabels(ctx, applicationIds),
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
    contents: [...contents, ...applicationContents],
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
  return { accounts: read.accounts, applications, contents };
}

/**
 * The occurrence's references with their names, in `Occurrence.refsOf`
 * order; a reference to something gone is labelled `null`.
 */
export function labelsOf(o: Occurrence, book: LabelBook): readonly RefLabel[] {
  return Occurrences.refsOf(o).map((ref): RefLabel => {
    switch (ref.kind) {
      case "application":
        return { ref, label: book.applications.get(ref.id) ?? null };
      case "account":
        return { ref, label: book.accounts.get(ref.id) ?? null };
      case "category":
      case "takedownClaim":
      case "infoReport":
        return { ref, label: null };
      default:
        return { ref, label: book.contents.get(ContentRef.key(ref)) ?? null };
    }
  });
}
