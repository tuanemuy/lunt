import {
  type ApplyEntry,
  loadListingRevisionPage,
  loadNewListingPage,
  loadPlaceRevisionPage,
  loadRegistrationPage,
  loadStewardshipPage,
} from "@/presentation/applyData";
import type { ApplyMode, ApplyPage } from "@/presentation/applyView";
import type { ErrorState } from "@/presentation/errorState";
import { readFailureState } from "@/presentation/readFailure";
import { ApplyProblem, ApplyRefused, type RefusedWhat } from "../ApplyParts";
import { ListingApplicationForm } from "../ListingApplicationForm";
import { PlaceRevisionForm } from "../PlaceRevisionForm";
import { RegistrationForm } from "../RegistrationForm";
import { StewardshipForm } from "../StewardshipForm";

/*
 * The application screens' bodies, read on the server; the forms own the
 * input and the submission. A load that fails renders its own common
 * state here, since an error thrown inside the RSC render reaches the
 * browser redacted.
 */

async function read<D>(
  load: () => Promise<ApplyPage<D>>,
): Promise<ApplyPage<D> | Readonly<{ kind: "problem"; state: ErrorState }>> {
  try {
    return await load();
  } catch (error) {
    return { kind: "problem", state: await readFailureState(error) };
  }
}

/**
 * The form's key: a resubmission's version, so reading it again after
 * CS-07 starts from the latest application instead of the kept input.
 */
const formKey = (mode: ApplyMode): string =>
  mode.kind === "resubmit"
    ? `${mode.applicationId}:${mode.version}`
    : mode.kind === "reapply"
      ? `reapply:${mode.from}`
      : "new";

function Unavailable({
  heading,
  page,
  what,
}: {
  heading: string;
  page:
    | Readonly<{ kind: "problem"; state: ErrorState }>
    | Extract<ApplyPage<unknown>, { kind: "refused" }>;
  what: RefusedWhat;
}) {
  return page.kind === "problem" ? (
    <ApplyProblem heading={heading} kind={page.state.kind} />
  ) : (
    <ApplyRefused heading={heading} refusal={page.refusal} what={what} />
  );
}

/** RQ-02 登録. */
export async function RegistrationContent({ entry }: { entry: ApplyEntry }) {
  const page = await read(() => loadRegistrationPage(entry));
  if (page.kind !== "form") {
    return (
      <Unavailable
        heading={
          entry.resubmit === null ? "新しいお店を登録" : "登録の申請を再提出"
        }
        page={page}
        what="registration"
      />
    );
  }
  return <RegistrationForm key={formKey(page.data.mode)} data={page.data} />;
}

/** RQ-02 修正. */
export async function PlaceRevisionContent({
  placeId,
  entry,
}: {
  placeId: string;
  entry: ApplyEntry;
}) {
  const page = await read(() => loadPlaceRevisionPage(placeId, entry));
  if (page.kind !== "form") {
    return (
      <Unavailable
        heading={
          entry.resubmit === null
            ? "お店の情報の修正を申請"
            : "修正の申請を再提出"
        }
        page={page}
        what="revision"
      />
    );
  }
  return <PlaceRevisionForm key={formKey(page.data.mode)} data={page.data} />;
}

/** RQ-03. */
export async function StewardshipContent({
  placeId,
  entry,
}: {
  placeId: string;
  entry: ApplyEntry;
}) {
  const page = await read(() => loadStewardshipPage(placeId, entry));
  if (page.kind !== "form") {
    return (
      <Unavailable
        heading={
          entry.resubmit === null
            ? "お店の管理を申請"
            : "管理権限の申請を再提出"
        }
        page={page}
        what="stewardship"
      />
    );
  }
  return <StewardshipForm key={formKey(page.data.mode)} data={page.data} />;
}

/** RQ-04 新しい掲載. */
export async function NewListingApplyContent({
  placeId,
  entry,
}: {
  placeId: string;
  entry: ApplyEntry;
}) {
  const page = await read(() => loadNewListingPage(placeId, entry));
  if (page.kind !== "form") {
    return (
      <Unavailable
        heading={entry.resubmit === null ? "掲載を申請" : "掲載の申請を再提出"}
        page={page}
        what="listing"
      />
    );
  }
  return (
    <ListingApplicationForm
      key={formKey(page.data.mode)}
      apply={{ kind: "new", data: page.data }}
    />
  );
}

/** RQ-04 修正. */
export async function ListingRevisionApplyContent({
  listingId,
  entry,
}: {
  listingId: string;
  entry: ApplyEntry;
}) {
  const page = await read(() => loadListingRevisionPage(listingId, entry));
  if (page.kind !== "form") {
    return (
      <Unavailable
        heading={
          entry.resubmit === null
            ? "掲載の修正を申請"
            : "掲載の修正の申請を再提出"
        }
        page={page}
        what="listingRevision"
      />
    );
  }
  return (
    <ListingApplicationForm
      key={formKey(page.data.mode)}
      apply={{ kind: "revision", data: page.data }}
    />
  );
}
