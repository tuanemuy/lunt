import {
  createFileRoute,
  type ErrorComponentProps,
  Outlet,
} from "@tanstack/react-router";
import { EventShell } from "@/components/event/EventShell";
import { ProxyUnavailablePanel } from "@/components/event/EventShell/EventProblem";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { useProxyVisited } from "@/components/ops/ProxyReturn";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { classifyError } from "@/presentation/errorState";
import { loadOccasionFrameFn } from "@/presentation/occasion";
import { OCCASION_PROXY_UNAVAILABLE } from "@/presentation/occasionView";

/**
 * The event management area (EM-01〜03, and CM-04 of the event's
 * participants): the event's operators, or a service operator while it has
 * none (CS-14). The guard's frame names the event in every screen below.
 */
export const Route = createFileRoute("/_manage/manage/events/$occasionId")({
  beforeLoad: async ({ params }) => ({
    frame: await loadOccasionFrameFn({
      data: { occasionId: params.occasionId },
    }),
  }),
  component: Outlet,
  errorComponent: EventAreaError,
});

/**
 * The guard refused or failed: CS-15 (an operator standing in for the
 * event, which has gained an event operator), CS-05, CS-17, or the common
 * error states. An operator who did not come as a stand-in (the event's
 * URL opened directly) is refused like anyone else (CS-05).
 */
function EventAreaError({ error }: ErrorComponentProps) {
  const refused = classifyError(error);
  const { occasionId } = Route.useParams();
  const proxied = useProxyVisited(occasionId);
  const lostProxy =
    refused.kind === "forbidden" &&
    refused.code === OCCASION_PROXY_UNAVAILABLE &&
    proxied;
  const title = (
    <ManageTitle>
      <ManageHeading>イベントの運営</ManageHeading>
    </ManageTitle>
  );
  return (
    <EventShell homeTo="/me">
      {lostProxy ? (
        <ManagePage title={title}>
          <ManageBody>
            <ProxyUnavailablePanel occasionId={occasionId} />
          </ManageBody>
        </ManagePage>
      ) : refused.kind === "forbidden" ? (
        <ManagePage title={title}>
          <ManageBody>
            <EmptyPanel
              title="このイベントを運営する権限がありません"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              イベントの管理権限を持つイベントだけを開けます。運営するイベントは、マイページから選べます。
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : refused.kind === "notFound" ? (
        <ManagePage title={title}>
          <ManageBody>
            <EmptyPanel
              title="このイベントは見つかりません"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              イベントが削除されたか、存在しないイベントです。イベントの情報と操作は示せません。
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : (
        <RouteErrorContent problem={{ kind: "error", error }} inManageShell />
      )}
    </EventShell>
  );
}
