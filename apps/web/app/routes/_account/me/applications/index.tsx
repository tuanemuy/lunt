import {
  createFileRoute,
  type ErrorComponentProps,
  useRouter,
} from "@tanstack/react-router";
import { useTransition } from "react";
import { ApplicationListSkeleton } from "@/components/application/ApplicationSkeleton";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import {
  ManageBackLink,
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Deferred } from "@/components/ui/Deferred";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { classifyError } from "@/presentation/errorState";
import {
  loadApplicationsFilterFn,
  myApplicationsSearchSchema,
} from "@/presentation/myApplications";
import { requireLogin } from "@/presentation/session";
import { renderMyApplications } from "./-render";

/**
 * MY-04 自分の申請の一覧. Needs a login (CS-04). `?place=` (from SM-01・
 * SM-05・SM-06) narrows it to one store's applications made as its
 * steward; a store the viewer does not act for is CS-05.
 */
export const Route = createFileRoute("/_account/me/applications/")({
  validateSearch: myApplicationsSearchSchema,
  beforeLoad: async ({ location, search }) => {
    await requireLogin(location);
    return {
      filter:
        search.place === undefined
          ? null
          : await loadApplicationsFilterFn({ data: { place: search.place } }),
    };
  },
  loaderDeps: ({ search }) => ({ place: search.place ?? null }),
  loader: async ({ deps }) => {
    const { Applications } = await renderMyApplications({
      data: { place: deps.place },
    });
    return { Applications };
  },
  head: () => ({ meta: [{ title: "自分の申請 — Lunt" }] }),
  component: MyApplicationsPage,
  errorComponent: MyApplicationsError,
});

function Title({ filtered }: { filtered: string | null }) {
  return (
    <ManageTitle>
      {filtered === null ? (
        <ManageBackLink to="/me">マイページ</ManageBackLink>
      ) : (
        <ManageBackLink
          to="/manage/places/$placeId"
          params={{ placeId: filtered }}
        >
          店舗ホーム
        </ManageBackLink>
      )}
      <ManageHeading>自分の申請</ManageHeading>
    </ManageTitle>
  );
}

function MyApplicationsPage() {
  const { Applications } = Route.useLoaderData();
  const { filter } = Route.useRouteContext();
  return (
    <ManagePage title={<Title filtered={filter?.id ?? null} />}>
      <Deferred promise={Applications} fallback={<ApplicationListSkeleton />} />
    </ManagePage>
  );
}

/**
 * CS-05 for a store the viewer does not act for; CS-02 when the list
 * could not be read (retrying reloads the route).
 */
function MyApplicationsError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const place = Route.useSearch({ select: (search) => search.place ?? null });
  const state = classifyError(error);
  if (state.kind === "loginRequired") {
    return <RouteErrorContent problem={{ kind: "error", error }} />;
  }
  if (state.kind === "forbidden" && place !== null) {
    return (
      <ManagePage title={<Title filtered={null} />}>
        <ManageBody>
          <EmptyPanel
            title="この店舗の申請は見られません"
            actions={
              <>
                <ButtonLink to="/me/applications">
                  すべての申請を見る
                </ButtonLink>
                <ButtonLink variant="secondary" to="/me">
                  マイページへ戻る
                </ButtonLink>
              </>
            }
          >
            この店舗の管理権限を持っていないため、店舗管理者として行った申請を表示できません。自分の申請は、絞り込みを外すと確かめられます。
          </EmptyPanel>
        </ManageBody>
      </ManagePage>
    );
  }
  return (
    <ManagePage title={<Title filtered={null} />}>
      <ManageBody>
        <Alert
          title="申請を読み込めませんでした"
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
              {retrying ? "読み込んでいます…" : "もう一度読み込む"}
            </Button>
          }
        >
          通信を確かめて、もう一度読み込んでください。
        </Alert>
      </ManageBody>
    </ManagePage>
  );
}
