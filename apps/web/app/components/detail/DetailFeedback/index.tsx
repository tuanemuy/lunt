import { useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { TextLink } from "@/components/ui/TextButton";

/** The other ways to explore (`spec/pages/index.md` CS-02, CS-06). */
const WAYS = {
  discover: { to: "/", label: "みつけるへ" },
  search: { to: "/search", label: "キーワードで探す" },
  map: { to: "/map", label: "地図で探す" },
  regions: { to: "/regions", label: "まちを探す" },
  events: { to: "/events", label: "イベントを見る" },
  articles: { to: "/articles", label: "読みものを見る" },
  saved: { to: "/saved", label: "保存を見る" },
} as const satisfies Record<string, { to: string; label: string }>;

type Way = keyof typeof WAYS;

/**
 * CS-06 per detail (DT-01〜DT-04 designs): the main way onward as a button
 * and the others as links — the region's to VW-05 まち, the occasion's to
 * VW-07 イベントの一覧.
 */
const UNAVAILABLE = {
  listing: {
    title: "この掲載は見られません。",
    body: "ほかの掲載を探してみてください。",
    action: { way: "discover", label: "みつけるへ" },
    links: ["search", "saved"],
  },
  place: {
    title: "このお店は見られません。",
    body: "ほかのお店を探してみてください。",
    action: { way: "map", label: "地図で探す" },
    links: ["search", "regions"],
  },
  region: {
    title: "この街は見られません。",
    body: "ほかの街を探してみてください。",
    action: { way: "regions", label: "まちを探す" },
    links: ["map", "search"],
  },
  occasion: {
    title: "このイベントは見られません。",
    body: "ほかのイベントを探してみてください。",
    action: { way: "events", label: "イベントの一覧へ" },
    links: ["discover", "search"],
  },
} as const satisfies Record<
  string,
  {
    title: string;
    body: string;
    action: { way: Way; label: string };
    links: readonly Way[];
  }
>;

/** CS-02 of every detail: the ways the spec lists for VW and DT. */
const LOAD_ERROR_LINKS: readonly Way[] = [
  "search",
  "map",
  "regions",
  "events",
  "articles",
  "saved",
];

function WayLinks({ ways }: { ways: readonly Way[] }) {
  return ways.map((way) => (
    <TextLink key={way} to={WAYS[way].to}>
      {WAYS[way].label}
    </TextLink>
  ));
}

/**
 * CS-06 of DT-01〜DT-04: the target is not viewable. Neither its name nor
 * its photo is shown, and why is not told; the viewer goes on to other
 * ways to explore.
 */
export function DetailUnavailable({
  kind,
}: {
  kind: keyof typeof UNAVAILABLE;
}) {
  const words = UNAVAILABLE[kind];
  return (
    <div className="container detail-page">
      <Feedback
        kind="empty"
        headingLevel="h1"
        title={words.title}
        body={
          <>
            公開が終わったか、表示できなくなっています。
            <br />
            {words.body}
          </>
        }
        action={
          <ButtonLink variant="secondary" to={WAYS[words.action.way].to}>
            {words.action.label}
          </ButtonLink>
        }
        links={<WayLinks ways={words.links} />}
      />
    </div>
  );
}

/** CS-02 of a detail: reading failed; retry, or explore another way. */
export function DetailLoadError() {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <div className="container detail-page">
      <Feedback
        kind="error"
        headingLevel="h1"
        title="うまく読み込めませんでした。"
        body={
          <>
            通信状況を確認して、
            <br />
            もう一度お試しください。
          </>
        }
        action={
          <Button
            variant="secondary"
            disabled={retrying}
            onClick={() =>
              startRetry(async () => {
                await router.invalidate({ sync: true });
              })
            }
          >
            {retrying ? "読み込んでいます…" : "もう一度読み込む"}
          </Button>
        }
        links={<WayLinks ways={LOAD_ERROR_LINKS} />}
      />
    </div>
  );
}
