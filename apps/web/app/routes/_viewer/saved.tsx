import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type ReactNode, useTransition } from "react";
import { DeviceSaved } from "@/components/bookmark/DeviceSaved";
import { SavedLoadFailure } from "@/components/bookmark/SavedFeedback";
import { SavedSkeleton } from "@/components/bookmark/SavedSkeleton";
import { keepOnReturn } from "@/components/explore/entryMemory";
import { Deferred } from "@/components/ui/Deferred";
import { buildHead } from "@/presentation/head";
import { renderSaved } from "./-renderSaved";

/**
 * VW-10 保存. Needs no login: signed out it lists this browser's saves,
 * signed in the account's (merging the browser's into it first, KEP-04).
 * Each opening reads the list afresh, before showing it (a stale copy would
 * bring back the rows removed last time); the rows a viewer removed here
 * stay only until then. Returning from a detail is not an opening.
 */
export const Route = createFileRoute("/_viewer/saved")({
  ...keepOnReturn,
  staticData: { viewerTab: "saved" },
  loader: { handler: () => renderSaved(), staleReloadMode: "blocking" },
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return { meta: [{ title: "保存 — Lunt" }] };
    const { meta, links } = buildHead(config, {
      title: "保存 — Lunt",
      path: "/saved",
    });
    return { meta, links };
  },
  component: SavedPage,
  errorComponent: SavedError,
});

function SavedFrame({ children }: { children: ReactNode }) {
  return (
    <div className="container saved">
      <h1 className="sr-only">保存</h1>
      {children}
    </div>
  );
}

function SavedPage() {
  const data = Route.useLoaderData();
  return (
    <SavedFrame>
      {data.signedIn ? (
        <Deferred promise={data.Saved} fallback={<SavedSkeleton />} />
      ) : (
        <DeviceSaved />
      )}
    </SavedFrame>
  );
}

/** CS-02: whether signed in, or the account's saves, could not be read. */
function SavedError() {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <SavedFrame>
      <SavedLoadFailure
        retrying={retrying}
        onRetry={() =>
          startRetry(async () => {
            await router.invalidate({ sync: true });
          })
        }
      />
    </SavedFrame>
  );
}
