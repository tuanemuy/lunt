import { createFileRoute } from "@tanstack/react-router";
import {
  MembersProblem,
  MembersScreen,
} from "@/components/members/MembersScreen";
import { loadMembersFrameFn } from "@/presentation/members";
import { renderMemberBoard } from "../../-members";

/**
 * CM-02 メンバーの管理 of a store. Not nested under the store's SM layout
 * (`$placeId_`): that layout admits only the store's stewards and a
 * standing-in operator, while CM-02 is also an operator's screen for a
 * stewarded store, and draws the frame of whoever opened it.
 */
export const Route = createFileRoute(
  "/_manage/manage/places/$placeId_/members",
)({
  beforeLoad: async ({ params }) => ({
    frame: await loadMembersFrameFn({
      data: { kind: "place", id: params.placeId },
    }),
  }),
  loader: async ({ params }) => {
    const { Board } = await renderMemberBoard({
      data: { kind: "place", id: params.placeId },
    });
    return { Board };
  },
  head: ({ match }) => ({
    meta: [
      {
        title: `メンバーの管理（${match.context.frame.name}） — Lunt`,
      },
    ],
  }),
  component: PlaceMembersPage,
  errorComponent: ({ error }) => <MembersProblem kind="place" error={error} />,
});

function PlaceMembersPage() {
  const { frame } = Route.useRouteContext();
  const { Board } = Route.useLoaderData();
  return <MembersScreen frame={frame} board={Board} />;
}
