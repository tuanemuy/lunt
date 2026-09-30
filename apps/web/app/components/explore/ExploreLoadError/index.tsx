"use client";

import { useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { TextLink } from "@/components/ui/TextButton";

/** Another way to explore a CS-02 offers (CS-02: 別の探索手段). */
export type ExploreWay =
  | "search"
  | "map"
  | "regions"
  | "events"
  | "articles"
  | "saved";

const WAYS: Readonly<
  Record<ExploreWay, Readonly<{ to: string; label: string }>>
> = {
  search: { to: "/search", label: "キーワードで探す" },
  map: { to: "/map", label: "マップで探す" },
  regions: { to: "/regions", label: "まちを探す" },
  events: { to: "/events", label: "イベントを見る" },
  articles: { to: "/articles", label: "読みものを読む" },
  saved: { to: "/saved", label: "保存を見る" },
};

/**
 * CS-02 of a viewer list (37 通信エラー): what could not be read, a retry
 * that reloads the route, and other ways to explore.
 */
export function ExploreLoadError({ ways }: { ways: readonly ExploreWay[] }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <Feedback
      kind="error"
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
      links={ways.map((way) => (
        <TextLink key={way} to={WAYS[way].to}>
          {WAYS[way].label}
        </TextLink>
      ))}
    />
  );
}
