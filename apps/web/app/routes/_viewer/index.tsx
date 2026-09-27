import { createFileRoute } from "@tanstack/react-router";
import { Feedback } from "@/components/ui/Feedback";
import { buildHead } from "@/presentation/head";

export const Route = createFileRoute("/_viewer/")({
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    const { meta, links } = buildHead(config, { path: "/" });
    return { meta, links };
  },
  component: DiscoverPage,
});

function DiscoverPage() {
  return (
    <div className="container flex flex-col gap-16 pb-21">
      <h1 className="sr-only">みつける</h1>
      <Feedback
        kind="empty"
        title="みつけるは、まもなく始まります。"
        body={
          <>
            写真から、まちのお店や地域を
            <br />
            見つけられるようになります。
          </>
        }
      />
    </div>
  );
}
