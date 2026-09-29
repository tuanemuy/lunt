"use client";

import { useLocation, useRouter } from "@tanstack/react-router";
import { type ReactNode, useTransition } from "react";
import { ManageBody } from "@/components/layout/ManageShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import type { ErrorState } from "@/presentation/errorState";
import { EventPage } from ".";
import { useOccasionFrame } from "./useOccasionFrame";

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

/** CS-15 of an event opened by proxy that has gained an event operator. */
export function ProxyUnavailablePanel({
  occasionId,
  children,
}: {
  occasionId: string;
  children?: ReactNode;
}) {
  return (
    <EmptyPanel
      title="このイベントは代行できません"
      actions={
        <ButtonLink
          to="/ops/subjects/$kind/$id"
          params={{ kind: "occasion", id: occasionId }}
        >
          イベントの運営へ戻る
        </ButtonLink>
      }
    >
      {children ??
        "このイベントにはイベント運営者が就きました。不在の代行はできません。イベントの運営の画面で、運営者がいることを確かめてください。"}
    </EmptyPanel>
  );
}

/**
 * An EM screen's content that could not be read, drawn in the event's
 * frame: CS-17 when the target is gone, CS-04 when the session ended,
 * CS-05 when the viewer no longer runs the event (CS-15 when an operator's
 * event gained an event operator), CS-02 otherwise (retry).
 */
export function EventProblem({
  kind,
  heading,
  missingTitle = "このイベントは見つかりません",
}: {
  kind: ErrorState["kind"];
  heading: string;
  missingTitle?: string;
}) {
  const frame = useOccasionFrame();
  const here = useLocation({ select: (location) => location.href });
  const body = (() => {
    switch (kind) {
      case "notFound":
        return (
          <EmptyPanel
            title={missingTitle}
            actions={
              <ButtonLink
                to="/manage/events/$occasionId"
                params={{ occasionId: frame.occasionId }}
              >
                参加店舗と申請へ戻る
              </ButtonLink>
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
            イベントの運営には、ログインが必要です。ログインすると、この画面に戻ります。
          </EmptyPanel>
        );
      case "forbidden":
        return frame.basis === "proxy" ? (
          <ProxyUnavailablePanel occasionId={frame.occasionId} />
        ) : (
          <EmptyPanel
            title="このイベントを運営する権限がありません"
            actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
          >
            イベントの管理権限を持つイベントだけを開けます。運営するイベントは、マイページから選べます。
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
    <EventPage frame={frame} heading={heading}>
      <ManageBody>{body}</ManageBody>
    </EventPage>
  );
}
