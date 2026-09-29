import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  EventPage,
  EventShell,
  occasionHomePath,
} from "@/components/event/EventShell";
import { EventSkeleton } from "@/components/event/EventSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { renderOccasionEditor } from "../-render";

const searchSchema = z.object({
  /** Arrived by registering the event (EM-02 新規 → 下書き). */
  created: z.boolean().optional().catch(undefined),
});

/** EM-02 イベント情報の編集. */
export const Route = createFileRoute("/_manage/manage/events/$occasionId/info")(
  {
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({ created: search.created === true }),
    loader: async ({ params, deps }) => {
      const { Content } = await renderOccasionEditor({
        data: { occasionId: params.occasionId, created: deps.created },
      });
      return { Content };
    },
    head: () => ({ meta: [{ title: "イベント情報 — Lunt" }] }),
    component: OccasionInfoPage,
  },
);

function OccasionInfoPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <EventShell homeTo={occasionHomePath(frame.occasionId)}>
      <Deferred
        promise={Content}
        fallback={
          <EventPage frame={frame} heading="イベント情報を編集">
            <EventSkeleton
              variant="form"
              label="イベント情報を読み込んでいます"
            />
          </EventPage>
        }
      />
    </EventShell>
  );
}
