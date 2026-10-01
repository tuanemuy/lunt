import {
  createFileRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { z } from "zod";
import { ShopProblem } from "@/components/manage/ShopProblem";
import { ShopPage, ShopShell } from "@/components/manage/ShopShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { classifyError } from "@/presentation/errorState";
import { renderListingEditor } from "../../../-render";

const searchSchema = z.object({
  /** The listing this draft was duplicated from (LST-09). */
  copyFrom: z.string().min(1).max(64).optional().catch(undefined),
  /** Arrived from SM-04 新規 after saving the draft (CS-13). */
  created: z.literal(true).optional().catch(undefined),
  /** Opened from a notification (MY-03 or its mail): CS-17 leads back there too. */
  from: z.literal("notifications").optional().catch(undefined),
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
  errorComponent: ListingEditorError,
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

/** The listing's read failed: CS-17 (back to SM-03), CS-05 or CS-02, in the store's frame. */
function ListingEditorError({ error }: ErrorComponentProps) {
  const { frame } = Route.useRouteContext();
  return (
    <ShopShell homeTo={`/manage/places/${frame.placeId}`}>
      <ShopProblem
        kind={classifyError(error).kind}
        heading="掲載を編集"
        missingTitle="この掲載は削除されています"
        back={{ label: "掲載の一覧へ戻る", to: "listings" }}
      />
    </ShopShell>
  );
}
