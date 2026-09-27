import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Generic, route-level navigation pending UI.
 *
 * Wired as the router's `defaultPendingComponent`: shown while a route whose
 * loader genuinely blocks resolves (past `defaultPendingMs`). Routes that
 * stream their own content via `<Deferred>` settle their loader
 * instantly and never trigger this — they rely on a per-fragment skeleton
 * instead.
 *
 * `role="status"` + `aria-live="polite"` + the sr-only label give one polite
 * announcement for the whole region; the bars are `aria-hidden` via `Skeleton`.
 */
export function RoutePendingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-start gap-24 px-gutter py-21"
    >
      <span className="sr-only">読み込み中</span>
      <Skeleton className="h-28 w-238" />
      <Skeleton className="aspect-[348/193] w-full max-w-700" />
      <Skeleton className="h-18 w-150" />
      <Skeleton className="h-24 w-230" />
    </div>
  );
}
