import { createFileRoute } from "@tanstack/react-router";
import { EventSkeleton } from "@/components/event/EventSkeleton";
import { ShopPage, ShopShell } from "@/components/manage/ShopShell";
import { Deferred } from "@/components/ui/Deferred";
import { renderParticipationEditor } from "../../../events/-render";

/** CM-04 参加内容の編集, the place's steward (from SM-06 or a notification). */
export const Route = createFileRoute(
  "/_manage/manage/places/$placeId/events/$occasionId",
)({
  loader: async ({ params }) => {
    const { Content } = await renderParticipationEditor({
      data: {
        side: "place",
        mode: "edit",
        occasionId: params.occasionId,
        placeId: params.placeId,
      },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "参加内容を編集 — Lunt" }] }),
  component: PlaceParticipationPage,
});

function PlaceParticipationPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <ShopShell homeTo={`/manage/places/${frame.placeId}`}>
      <Deferred
        promise={Content}
        fallback={
          <ShopPage frame={frame} heading="参加内容を編集">
            <EventSkeleton
              variant="participation"
              label="参加内容を読み込んでいます"
            />
          </ShopPage>
        }
      />
    </ShopShell>
  );
}
