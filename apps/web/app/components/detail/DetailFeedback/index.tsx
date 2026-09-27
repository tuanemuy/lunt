import { useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { TextLink } from "@/components/ui/TextButton";

// Plain paths: the exploration screens (VW) arrive in stage 4, and the
// router only type-checks literal paths it already knows.
const EXPLORE: Readonly<
  Record<
    "discover" | "search" | "map" | "regions" | "events" | "articles" | "saved",
    string
  >
> = {
  discover: "/",
  search: "/search",
  map: "/map",
  regions: "/regions",
  events: "/events",
  articles: "/articles",
  saved: "/saved",
};

const UNAVAILABLE = {
  listing: {
    title: "この掲載は見られません。",
    body: "ほかの掲載を探してみてください。",
    action: { to: EXPLORE.discover, label: "みつけるへ" },
    links: [
      { to: EXPLORE.search, label: "キーワードで探す" },
      { to: EXPLORE.saved, label: "保存を見る" },
    ],
  },
  place: {
    title: "このお店は見られません。",
    body: "ほかのお店を探してみてください。",
    action: { to: EXPLORE.map, label: "地図で探す" },
    links: [
      { to: EXPLORE.search, label: "キーワードで探す" },
      { to: EXPLORE.regions, label: "まちを探す" },
    ],
  },
} as const;

/**
 * CS-06 of DT-01 / DT-02: the target is not viewable. Neither its name
 * nor its photo is shown, and why is not told.
 */
export function DetailUnavailable({ kind }: { kind: "listing" | "place" }) {
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
          <ButtonLink variant="secondary" to={words.action.to}>
            {words.action.label}
          </ButtonLink>
        }
        links={words.links.map((link) => (
          <TextLink key={link.to} to={link.to}>
            {link.label}
          </TextLink>
        ))}
      />
    </div>
  );
}

const OTHER_WAYS = [
  { to: EXPLORE.search, label: "キーワードで探す" },
  { to: EXPLORE.map, label: "地図で探す" },
  { to: EXPLORE.regions, label: "まちを探す" },
  { to: EXPLORE.events, label: "イベントを見る" },
  { to: EXPLORE.articles, label: "読みものを見る" },
  { to: EXPLORE.saved, label: "保存を見る" },
] as const;

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
        links={OTHER_WAYS.map((link) => (
          <TextLink key={link.to} to={link.to}>
            {link.label}
          </TextLink>
        ))}
      />
    </div>
  );
}
