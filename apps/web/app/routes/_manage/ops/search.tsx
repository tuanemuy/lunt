import { createFileRoute } from "@tanstack/react-router";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { OpsSearchForms } from "@/components/ops/OpsSearchForms";
import { OpsNav } from "@/components/ops/OpsShell";
import { Deferred } from "@/components/ui/Deferred";
import { Skeleton } from "@/components/ui/Skeleton";
import { opsSearchSearchSchema } from "@/presentation/opsSearch";
import { renderOpsSearch } from "./-render";

/**
 * OM-02 対象を探す: stores by name / address and listings by keyword,
 * hidden ones included, with the ways into OM-03, the absence proxy and
 * the proxy registration. Regions and events join with their stages.
 */
export const Route = createFileRoute("/_manage/ops/search")({
  validateSearch: opsSearchSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    if (deps.kind === undefined) return { Results: null };
    const { Results } = await renderOpsSearch({ data: deps });
    return { Results };
  },
  head: () => ({ meta: [{ title: "対象を探す — Lunt" }] }),
  component: OpsSearchPage,
});

function ResultsSkeleton() {
  return (
    <div className="m-skeleton" aria-busy="true">
      <Skeleton variant="manage" className="h-27 w-2/5" />
      <Skeleton variant="manage" className="h-88 w-full rounded-8" />
      <Skeleton variant="manage" className="h-88 w-full rounded-8" />
      <p className="sr-only" role="status">
        探しています
      </p>
    </div>
  );
}

function OpsSearchPage() {
  const { Results } = Route.useLoaderData();
  const search = Route.useSearch();
  return (
    <ManagePage
      title={
        <ManageTitle>
          <ManageHeading>対象を探す</ManageHeading>
        </ManageTitle>
      }
      nav={<OpsNav />}
    >
      <ManageBody>
        <p className="om02-lead">
          店舗と掲載を、閲覧者に表示されていないもの（下書き、一時非公開、運営による非公開、非公開の店舗）も含めて探します。
        </p>
        <OpsSearchForms key={JSON.stringify(search)} search={search} />
        {Results === null ? null : (
          <Deferred promise={Results} fallback={<ResultsSkeleton />} />
        )}
      </ManageBody>
    </ManagePage>
  );
}
