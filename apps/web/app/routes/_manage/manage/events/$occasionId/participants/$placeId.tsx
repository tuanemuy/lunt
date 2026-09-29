import { createFileRoute } from "@tanstack/react-router";
import {
  EventPage,
  EventShell,
  occasionHomePath,
} from "@/components/event/EventShell";
import { EventSkeleton } from "@/components/event/EventSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { renderParticipationEditor } from "../../-render";

/** CM-04 参加内容の編集, the event's operator changing a place without a steward. */
export const Route = createFileRoute(
  "/_manage/manage/events/$occasionId/participants/$placeId",
)({
  loader: async ({ params }) => {
    const { Content } = await renderParticipationEditor({
      data: {
        side: "occasion",
        mode: "edit",
        occasionId: params.occasionId,
        placeId: params.placeId,
      },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "参加内容を編集 — Lunt" }] }),
  component: ParticipantPage,
});

function ParticipantPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <EventShell homeTo={occasionHomePath(frame.occasionId)}>
      <Deferred
        promise={Content}
        fallback={
          <EventPage
            frame={frame}
            heading="参加内容を編集"
            current="participants"
          >
            <EventSkeleton
              variant="participation"
              label="参加内容を読み込んでいます"
            />
          </EventPage>
        }
      />
    </EventShell>
  );
}
