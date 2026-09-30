import { createFileRoute } from "@tanstack/react-router";
import {
  DetailLoadError,
  DetailUnavailable,
} from "@/components/detail/DetailFeedback";
import { DetailSkeleton } from "@/components/detail/DetailSkeleton";
import { OccasionDetail } from "@/components/detail/OccasionDetail";
import { loadOccasionDetailFn, orNotFound } from "@/presentation/detail";
import { buildHead } from "@/presentation/head";

/**
 * DT-04 イベント詳細. Needs no login. An occasion that is a draft,
 * unpublished, suspended or missing answers CS-06 with HTTP 404; ended
 * and cancelled ones stay viewable. The header names the event
 * (`viewerTitle`); CS-06 / CS-01 / CS-02 keep the fixed イベント.
 */
export const Route = createFileRoute("/_viewer/events/$occasionId/")({
  staticData: {
    viewerHeader: { type: "detail", title: "イベント" },
    viewerTab: "regions",
  },
  loader: async ({ params }) => {
    const detail = await orNotFound(
      loadOccasionDetailFn({ data: { occasionId: params.occasionId } }),
    );
    return { detail, viewerTitle: detail.name };
  },
  head: ({ match, loaderData, params }) => {
    const config = match.context?.config;
    // A re-read that found the target gone (CS-06) keeps the old data.
    if (!config || loaderData === undefined || match.status === "notFound") {
      return { meta: [{ title: "イベント — Lunt" }] };
    }
    const { detail } = loaderData;
    const cover = detail.photos[0]?.photo?.src;
    const description = detail.tagline ?? detail.description;
    const { meta, links } = buildHead(config, {
      title: `${detail.name} — Lunt`,
      ...(description === null ? {} : { description }),
      path: `/events/${encodeURIComponent(params.occasionId)}`,
      ...(cover === undefined ? {} : { ogImage: cover }),
    });
    return { meta, links };
  },
  pendingComponent: () => <DetailSkeleton label="イベントを読み込んでいます" />,
  notFoundComponent: () => <DetailUnavailable kind="occasion" />,
  errorComponent: DetailLoadError,
  component: OccasionPage,
});

function OccasionPage() {
  const { detail } = Route.useLoaderData();
  return <OccasionDetail key={detail.occasionId} data={detail} />;
}
