"use client";

import { useLocation, useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { ManageBody } from "@/components/layout/ManageShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import type { ErrorState } from "@/presentation/errorState";
import { RegionPage } from "../RegionShell";
import { useRegionFrame } from "../RegionShell/useRegionFrame";

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
 * An RM screen's content that could not be read, drawn in the region's
 * frame: CS-17 when the region is gone, CS-04 when the session ended, CS-05
 * when the viewer no longer manages it (CS-15 when an operator's region
 * gained a steward), CS-02 otherwise (retry).
 */
export function RegionProblem({
  kind,
  heading,
  failedTitle,
}: {
  kind: ErrorState["kind"];
  heading: string;
  /** CS-02's title, e.g. 所属店舗と申請を読み込めませんでした. */
  failedTitle: string;
}) {
  const frame = useRegionFrame();
  const here = useLocation({ select: (location) => location.href });
  const body = (() => {
    switch (kind) {
      case "notFound":
        return (
          <EmptyPanel
            title="この地域は見つかりません"
            actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
          >
            地域が削除されたか、存在しない地域です。地域の情報と操作は示せません。
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
            地域の運営には、ログインが必要です。ログインすると、この画面に戻ります。
          </EmptyPanel>
        );
      case "forbidden":
        return frame.basis === "proxy" ? (
          <EmptyPanel
            title="この地域は代行できません"
            actions={
              <ButtonLink
                to="/ops/subjects/$kind/$id"
                params={{ kind: "region", id: frame.regionId }}
              >
                地域の運営へ戻る
              </ButtonLink>
            }
          >
            この地域には地域運営者が就きました。不在の代行はできません。地域の運営の画面で、運営者がいることを確かめてください。
          </EmptyPanel>
        ) : (
          <EmptyPanel
            title="この地域を運営する権限がありません"
            actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
          >
            地域の管理権限を持つ地域だけを開けます。運営する地域は、マイページから選べます。
          </EmptyPanel>
        );
      default:
        return (
          <EmptyPanel title={failedTitle} actions={<Retry />}>
            通信を確かめて、もう一度読み込んでください。
          </EmptyPanel>
        );
    }
  })();
  return (
    <RegionPage frame={frame} heading={heading}>
      <ManageBody>{body}</ManageBody>
    </RegionPage>
  );
}
