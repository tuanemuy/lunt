import { createFileRoute } from "@tanstack/react-router";
import { ExploreLoadError } from "@/components/explore/ExploreLoadError";
import { EventsSkeleton } from "@/components/explore/ExploreSkeletons";
import { keepOnReturn } from "@/components/explore/entryMemory";
import { Deferred } from "@/components/ui/Deferred";
import { buildHead } from "@/presentation/head";
import { renderEvents } from "../-renderExplore";

/** VW-07 イベントの一覧. Needs no login; no browse condition applies. */
export const Route = createFileRoute("/_viewer/events/")({
  ...keepOnReturn,
  staticData: {
    viewerHeader: { type: "detail", title: "街のイベント" },
    viewerTab: "regions",
  },
  loader: async () => {
    const { Events } = await renderEvents();
    return { Events };
  },
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return { meta: [{ title: "イベント — Lunt" }] };
    const { meta, links } = buildHead(config, {
      title: "イベント — Lunt",
      path: "/events",
    });
    return { meta, links };
  },
  component: EventsPage,
  errorComponent: EventsError,
});

function EventsHead() {
  return (
    <>
      <h1 className="sr-only">イベントの一覧</h1>
      <p className="events__catch">
        街に出かける、
        <br />
        きっかけを。
      </p>
    </>
  );
}

function EventsPage() {
  const { Events } = Route.useLoaderData();
  return (
    <div className="container events">
      <EventsHead />
      <Deferred promise={Events} fallback={<EventsSkeleton />} />
    </div>
  );
}

/** CS-02: the occasions could not be read. */
function EventsError() {
  return (
    <div className="container events">
      <EventsHead />
      <ExploreLoadError ways={["search", "regions", "articles", "saved"]} />
    </div>
  );
}
