import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import {
  FIND_PLACE_FORM_ID,
  FindPlaceForm,
} from "@/components/request/FindPlaceForm";
import { FindPlaceGuide } from "@/components/request/FindPlaceGuide";
import { PlaceMatchesSkeleton } from "@/components/request/PlaceMatchesSkeleton";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Deferred } from "@/components/ui/Deferred";
import { findPlaceSearchSchema } from "@/presentation/findPlace";
import { renderPlaceMatches } from "./-render";

/**
 * RQ-01 店舗を探す: the guide for stores, then a search of the public
 * places by name and / or address. Needs no login. The terms live in the
 * URL (`name`, `address`); the results stream in under a skeleton.
 */
export const Route = createFileRoute("/_apply/apply/find-place")({
  validateSearch: findPlaceSearchSchema,
  loaderDeps: ({ search }) => ({ name: search.name, address: search.address }),
  loader: async ({ deps }) => {
    if (deps.name === undefined && deps.address === undefined) {
      return { Matches: null };
    }
    const { Matches } = await renderPlaceMatches({
      data: { name: deps.name ?? null, address: deps.address ?? null },
    });
    return { Matches };
  },
  head: () => ({ meta: [{ title: "お店の管理を始める — Lunt" }] }),
  component: FindPlacePage,
  errorComponent: FindPlaceError,
});

function Title() {
  return (
    <ManageTitle>
      <ManageHeading>お店の管理を始める</ManageHeading>
    </ManageTitle>
  );
}

/** お店を探す, and — once searched, whatever the results — the way to register a new place (RQ-02). */
function Actions({ searched }: { searched: boolean }) {
  return (
    <>
      <Button type="submit" form={FIND_PLACE_FORM_ID}>
        お店を探す
      </Button>
      {searched ? (
        <ButtonLink variant="secondary" to="/apply/places/new">
          見つからないので新規登録
        </ButtonLink>
      ) : null}
    </>
  );
}

function FindPlacePage() {
  const { name, address } = Route.useSearch();
  const { Matches } = Route.useLoaderData();
  const searched = Matches !== null;
  const terms = `${name ?? ""}\u0000${address ?? ""}`;
  return (
    <ManagePage title={<Title />} actions={<Actions searched={searched} />}>
      <ManageBody>
        {searched ? null : <FindPlaceGuide />}
        <p className="my-lead">すでに掲載されているお店を探します。</p>
        <FindPlaceForm
          key={`form:${terms}`}
          name={name ?? ""}
          address={address ?? ""}
          searched={searched}
        />
        {Matches === null ? null : (
          // A new search starts from the skeleton (CS-01), not from the
          // previous search's rows.
          <Deferred
            key={`matches:${terms}`}
            promise={Matches}
            fallback={<PlaceMatchesSkeleton />}
          />
        )}
      </ManageBody>
    </ManagePage>
  );
}

/** CS-02: the search failed; the terms stay in the URL and the fields. */
function FindPlaceError() {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const { name, address } = Route.useSearch();
  const terms = `${name ?? ""}\u0000${address ?? ""}`;
  return (
    <ManagePage title={<Title />} actions={<Actions searched />}>
      <ManageBody>
        <Alert
          title="お店を探せませんでした"
          actions={
            <Button
              variant="secondary"
              disabled={retrying}
              onClick={() =>
                startRetry(async () => {
                  await router.invalidate({ sync: true });
                })
              }
            >
              {retrying ? "探しています…" : "もう一度探す"}
            </Button>
          }
        >
          通信を確かめて、もう一度探してください。入力した語は残っています。
        </Alert>
        <p className="my-lead">すでに掲載されているお店を探します。</p>
        <FindPlaceForm
          key={`form:${terms}`}
          name={name ?? ""}
          address={address ?? ""}
          searched
        />
      </ManageBody>
    </ManagePage>
  );
}
