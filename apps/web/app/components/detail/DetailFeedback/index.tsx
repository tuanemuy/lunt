import { useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { TextLink } from "@/components/ui/TextButton";

// The exploration screens that lead on from a detail (VW-03 search, VW-04
// map, regions, events, articles, VW-10 saved) arrive in stage 4; until
// then only みつける exists, and the other ways are not offered.
const UNAVAILABLE = {
  listing: {
    title: "この掲載は見られません。",
    body: "ほかの掲載を探してみてください。",
  },
  place: {
    title: "このお店は見られません。",
    body: "ほかのお店を探してみてください。",
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
          <ButtonLink variant="secondary" to="/">
            みつけるへ
          </ButtonLink>
        }
      />
    </div>
  );
}

/** CS-02 of a detail: reading failed; retry, or go back to みつける. */
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
        links={<TextLink to="/">みつけるへ</TextLink>}
      />
    </div>
  );
}
