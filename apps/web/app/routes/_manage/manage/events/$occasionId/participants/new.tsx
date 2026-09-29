import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  EventPage,
  EventShell,
  occasionHomePath,
} from "@/components/event/EventShell";
import { EventSkeleton } from "@/components/event/EventSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { renderParticipationEditor } from "../../-render";

const searchSchema = z.object({
  /** The place picked from CF-02's candidates. */
  place: z.string().min(1).max(64).optional().catch(undefined),
});

/** CM-04 追加: the event's operator adds a place without a steward (EVT-10). */
export const Route = createFileRoute(
  "/_manage/manage/events/$occasionId/participants/new",
)({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ place: search.place }),
  loader: async ({ params, deps }) => {
    const { Content } = await renderParticipationEditor({
      data: {
        side: "occasion",
        mode: "add",
        occasionId: params.occasionId,
        ...(deps.place === undefined ? {} : { placeId: deps.place }),
      },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "参加店舗を追加 — Lunt" }] }),
  component: NewParticipantPage,
});

function NewParticipantPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <EventShell homeTo={occasionHomePath(frame.occasionId)}>
      <Deferred
        promise={Content}
        fallback={
          <EventPage
            frame={frame}
            heading="参加店舗を追加"
            current="participants"
          >
            <EventSkeleton
              variant="participation"
              label="参加店舗の追加を読み込んでいます"
            />
          </EventPage>
        }
      />
    </EventShell>
  );
}
