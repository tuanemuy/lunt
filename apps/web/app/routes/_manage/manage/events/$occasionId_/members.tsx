import { createFileRoute } from "@tanstack/react-router";
import {
  MembersProblem,
  MembersScreen,
} from "@/components/members/MembersScreen";
import { loadMembersFrameFn } from "@/presentation/members";
import { renderMemberBoard } from "../../-members";

/** CM-02 メンバーの管理 of an event. */
export const Route = createFileRoute(
  "/_manage/manage/events/$occasionId_/members",
)({
  beforeLoad: async ({ params }) => ({
    frame: await loadMembersFrameFn({
      data: { kind: "occasion", id: params.occasionId },
    }),
  }),
  loader: async ({ params }) => {
    const { Board } = await renderMemberBoard({
      data: { kind: "occasion", id: params.occasionId },
    });
    return { Board };
  },
  head: ({ match }) => ({
    meta: [{ title: `メンバーの管理（${match.context.frame.name}） — Lunt` }],
  }),
  component: EventMembersPage,
  errorComponent: ({ error }) => (
    <MembersProblem kind="occasion" error={error} />
  ),
});

function EventMembersPage() {
  const { frame } = Route.useRouteContext();
  const { Board } = Route.useLoaderData();
  return <MembersScreen frame={frame} board={Board} />;
}
