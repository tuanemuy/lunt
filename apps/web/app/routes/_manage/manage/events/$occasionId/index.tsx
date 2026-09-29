import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  EventPage,
  EventShell,
  occasionHomePath,
} from "@/components/event/EventShell";
import { EventSkeleton } from "@/components/event/EventSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { renderParticipantBoard } from "../-render";

const searchSchema = z.object({
  /** The place a notification (参加の取りやめ・参加内容の変更) is about. */
  participant: z.string().min(1).max(64).optional().catch(undefined),
});

/** EM-01 参加店舗と申請. */
export const Route = createFileRoute("/_manage/manage/events/$occasionId/")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ participant: search.participant }),
  loader: async ({ params, deps }) => {
    const { Content } = await renderParticipantBoard({
      data: {
        occasionId: params.occasionId,
        ...(deps.participant === undefined
          ? {}
          : { participant: deps.participant }),
      },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "参加店舗と申請 — Lunt" }] }),
  component: ParticipantsPage,
});

function ParticipantsPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <EventShell homeTo={occasionHomePath(frame.occasionId)}>
      <Deferred
        promise={Content}
        fallback={
          <EventPage frame={frame} heading="参加店舗と申請">
            <EventSkeleton
              variant="list"
              label="参加店舗と申請を読み込んでいます"
            />
          </EventPage>
        }
      />
    </EventShell>
  );
}
