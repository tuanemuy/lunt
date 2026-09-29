"use client";

import { useLocation, useRouter, useSearch } from "@tanstack/react-router";
import { useTransition } from "react";
import { ManageBody } from "@/components/layout/ManageShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import type { ErrorState } from "@/presentation/errorState";
import { ShopPage } from "../ShopShell";
import { usePlaceFrame } from "../ShopShell/usePlaceFrame";

/** What an SM screen could not show. */
export type ShopProblemKind = ErrorState["kind"];

type ShopProblemProps = {
  kind: ShopProblemKind;
  /** The screen's heading (none on SM-01). */
  heading?: string;
  /** CS-17's words for the target that is gone, e.g. この掲載は削除されています. */
  missingTitle: string;
  /** Where CS-17 leads back to. */
  back: Readonly<{ label: string; to: "listings" | "home" }>;
};

function Retry() {
  const router = useRouter();
  const [pending, startRetry] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startRetry(async () => {
          await router.invalidate({ sync: true });
        })
      }
    >
      {pending ? "読み込んでいます…" : "もう一度読み込む"}
    </Button>
  );
}

/**
 * An SM screen's content that could not be read, drawn in the store's
 * frame: CS-17 when the target is gone, CS-04 when the session ended, CS-05
 * when the viewer no longer manages the store (CS-15 when an operator's
 * store gained a steward), CS-02 otherwise (retry).
 */
export function ShopProblem({
  kind,
  heading,
  missingTitle,
  back,
}: ShopProblemProps) {
  const frame = usePlaceFrame();
  const here = useLocation({ select: (location) => location.href });
  const fromNotifications = useSearch({
    strict: false,
    select: (search) => search.from === "notifications",
  });
  const params = { placeId: frame.placeId };
  const body = (() => {
    switch (kind) {
      case "notFound":
        return (
          <EmptyPanel
            title={missingTitle}
            actions={
              <>
                <ButtonLink
                  to={
                    back.to === "listings"
                      ? "/manage/places/$placeId/listings"
                      : "/manage/places/$placeId"
                  }
                  params={params}
                >
                  {back.label}
                </ButtonLink>
                {fromNotifications ? (
                  <ButtonLink to="/me/notifications" variant="secondary">
                    通知一覧へ戻る
                  </ButtonLink>
                ) : null}
              </>
            }
          >
            削除されたか、存在しない対象です。操作は反映していません。
          </EmptyPanel>
        );
      case "loginRequired":
        return (
          <EmptyPanel
            title="ログインが必要です"
            actions={
              <ButtonLink to="/login" search={{ next: here }}>
                ログインする
              </ButtonLink>
            }
          >
            ログインの有効期限が切れました。ログインすると、この画面に戻ります。
          </EmptyPanel>
        );
      case "forbidden":
        return frame.basis === "proxy" ? (
          <EmptyPanel
            title="この店舗は代行できません"
            actions={
              <ButtonLink
                to="/ops/subjects/$kind/$id"
                params={{ kind: "place", id: frame.placeId }}
              >
                店舗の運営へ戻る
              </ButtonLink>
            }
          >
            この店舗には店舗管理者が就きました。不在の代行はできません。店舗の運営の画面で、管理者がいることを確かめてください。
          </EmptyPanel>
        ) : (
          <EmptyPanel
            title="この店舗を管理する権限がありません"
            actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
          >
            店舗の管理権限を持つ店舗だけを開けます。管理する店舗は、マイページから選べます。
          </EmptyPanel>
        );
      default:
        return (
          <EmptyPanel title="読み込めませんでした" actions={<Retry />}>
            通信を確かめて、もう一度読み込んでください。
          </EmptyPanel>
        );
    }
  })();
  return (
    <ShopPage frame={frame} {...(heading === undefined ? {} : { heading })}>
      <ManageBody>{body}</ManageBody>
    </ShopPage>
  );
}
