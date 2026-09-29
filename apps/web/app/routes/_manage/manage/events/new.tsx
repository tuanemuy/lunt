import {
  createFileRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { EventShell } from "@/components/event/EventShell";
import { EventSkeleton } from "@/components/event/EventSkeleton";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { ButtonLink } from "@/components/ui/Button";
import { Deferred } from "@/components/ui/Deferred";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { classifyError } from "@/presentation/errorState";
import { requireOperatorFn } from "@/presentation/roles";
import { renderNewOccasion } from "./-render";

/**
 * EM-02 新規: a service operator registers an event (EVT-12), opened from
 * OM-02. Operators only (CS-05).
 */
export const Route = createFileRoute("/_manage/manage/events/new")({
  beforeLoad: () => requireOperatorFn(),
  loader: async () => {
    const { Content } = await renderNewOccasion();
    return { Content };
  },
  head: () => ({ meta: [{ title: "イベントを登録 — Lunt" }] }),
  component: NewOccasionPage,
  errorComponent: NewOccasionError,
});

function Title() {
  return (
    <ManageTitle>
      <ManageHeading>イベントを登録</ManageHeading>
    </ManageTitle>
  );
}

function NewOccasionPage() {
  const { Content } = Route.useLoaderData();
  return (
    <EventShell homeTo="/ops/search">
      <Deferred
        promise={Content}
        fallback={
          <ManagePage title={<Title />}>
            <EventSkeleton
              variant="form"
              label="登録の画面を読み込んでいます"
            />
          </ManagePage>
        }
      />
    </EventShell>
  );
}

function NewOccasionError({ error }: ErrorComponentProps) {
  return (
    <EventShell homeTo="/me">
      {classifyError(error).kind === "forbidden" ? (
        <ManagePage title={<Title />}>
          <ManageBody>
            <EmptyPanel
              title="サービス運営者ではありません"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              イベントの登録は、サービス運営者だけが行えます。
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : (
        <RouteErrorContent problem={{ kind: "error", error }} inManageShell />
      )}
    </EventShell>
  );
}
