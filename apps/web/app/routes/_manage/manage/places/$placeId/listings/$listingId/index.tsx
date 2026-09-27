import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ShopPage, ShopShell } from "@/components/manage/ShopShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { renderListingEditor } from "../../../-render";

const searchSchema = z.object({
  /** The listing this draft was duplicated from (LST-09). */
  copyFrom: z.string().min(1).max(64).optional().catch(undefined),
  /** Arrived from SM-04 新規 after saving the draft (CS-13). */
  created: z.literal(true).optional().catch(undefined),
});

/** SM-04 掲載の編集. */
export const Route = createFileRoute(
  "/_manage/manage/places/$placeId/listings/$listingId/",
)({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    copyFrom: search.copyFrom,
    created: search.created === true,
  }),
  loader: async ({ params, deps }) => {
    const { Content } = await renderListingEditor({
      data: {
        placeId: params.placeId,
        listingId: params.listingId,
        ...(deps.copyFrom === undefined ? {} : { copyFrom: deps.copyFrom }),
        created: deps.created,
      },
    });
    return { Content };
  },
  head: () => ({ meta: [{ title: "掲載を編集 — Lunt" }] }),
  component: ListingEditorPage,
});

function ListingEditorPage() {
  const { Content } = Route.useLoaderData();
  const { frame } = Route.useRouteContext();
  return (
    <ShopShell homeTo={`/manage/places/${frame.placeId}`}>
      <Deferred
        promise={Content}
        fallback={
          <ShopPage frame={frame} heading="掲載を編集">
            <ShopSkeleton variant="form" label="掲載を読み込んでいます" />
          </ShopPage>
        }
      />
    </ShopShell>
  );
}
