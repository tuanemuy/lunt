import { createFileRoute } from "@tanstack/react-router";
import {
  MembersProblem,
  MembersScreen,
} from "@/components/members/MembersScreen";
import { loadMembersFrameFn } from "@/presentation/members";
import { renderMemberBoard } from "../../-members";

/**
 * CM-02 メンバーの管理 of a region. Regions arrive in stage 3 (S3A); until
 * then every id reads as a missing target (CS-17).
 */
export const Route = createFileRoute(
  "/_manage/manage/regions/$regionId_/members",
)({
  beforeLoad: async ({ params }) => ({
    frame: await loadMembersFrameFn({
      data: { kind: "region", id: params.regionId },
    }),
  }),
  loader: async ({ params }) => {
    const { Board } = await renderMemberBoard({
      data: { kind: "region", id: params.regionId },
    });
    return { Board };
  },
  head: ({ match }) => ({
    meta: [{ title: `メンバーの管理（${match.context.frame.name}） — Lunt` }],
  }),
  component: RegionMembersPage,
  errorComponent: ({ error }) => <MembersProblem kind="region" error={error} />,
});

function RegionMembersPage() {
  const { frame } = Route.useRouteContext();
  const { Board } = Route.useLoaderData();
  return <MembersScreen frame={frame} board={Board} />;
}
