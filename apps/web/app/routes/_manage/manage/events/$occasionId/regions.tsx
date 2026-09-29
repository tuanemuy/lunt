import { createFileRoute } from "@tanstack/react-router";
import {
  EventPage,
  EventShell,
  occasionHomePath,
} from "@/components/event/EventShell";
import { EventSkeleton } from "@/components/event/EventSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { renderRegionLinks } from "../-render";

/** EM-03 開催地域の関連づけ. */
export const Route = createFileRoute(
  "/_manage/manage/events/$occasionId/regions",
)({
  loader: async ({ params }) => {
    const { Content } = await renderRegionLinks({
      data: { occasionId: params.occasionId },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "開催地域 — Lunt" }] }),
  component: RegionLinksPage,
});

function RegionLinksPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <EventShell homeTo={occasionHomePath(frame.occasionId)}>
      <Deferred
        promise={Content}
        fallback={
          <EventPage frame={frame} heading="開催地域">
            <EventSkeleton variant="list" label="開催地域を読み込んでいます" />
          </EventPage>
        }
      />
    </EventShell>
  );
}
