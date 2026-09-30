"use client";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { Notice } from "@/components/ui/Notice";
import { TextLink } from "@/components/ui/TextButton";
import { SavedTitle } from "../SavedSkeleton";

// Plain paths: the exploration screens are other areas' routes.
const EXPLORE: Readonly<
  Record<"search" | "map" | "regions" | "articles", string>
> = {
  search: "/search",
  map: "/map",
  regions: "/regions",
  articles: "/articles",
};

/** 「ログインする」 of VW-10: MY-02, returning here once signed in (KEP-04). */
export function SavedLoginLink() {
  return (
    <TextLink to="/login" search={{ next: "/saved" }}>
      ログインする
    </TextLink>
  );
}

/**
 * CS-09 of VW-10 (「保存がない」, 30 保存・未保存): the other ways to
 * explore; signed out, also that signing in shows the saves of another
 * device (MY-02).
 */
export function SavedEmpty({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <Feedback
        kind="empty"
        icon="bookmark"
        title="気になるものを、ここに。"
        body={
          <>
            写真の保存マークを押すと、
            <br />
            あとでまとめて見返せます。
          </>
        }
        action={
          <ButtonLink variant="secondary" to="/">
            みつけるへ
          </ButtonLink>
        }
        links={
          <>
            <TextLink to={EXPLORE.search}>キーワードで探す</TextLink>
            <TextLink to={EXPLORE.map}>地図で探す</TextLink>
            <TextLink to={EXPLORE.regions}>まちを探す</TextLink>
            <TextLink to={EXPLORE.articles}>読みものを読む</TextLink>
          </>
        }
      />
      {signedIn ? null : (
        <Notice
          title="別の端末で保存したものは、ログインすると見返せます"
          actions={<SavedLoginLink />}
        >
          {undefined}
        </Notice>
      )}
    </>
  );
}

/**
 * CS-02 of VW-10: the saves (or, signed out, their content) could not be
 * read. Retry, or explore another way.
 */
export function SavedLoadFailure({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <>
      <SavedTitle />
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
          <Button variant="secondary" disabled={retrying} onClick={onRetry}>
            {retrying ? "読み込んでいます…" : "もう一度読み込む"}
          </Button>
        }
        links={
          <>
            <TextLink to="/">みつけるへ</TextLink>
            <TextLink to={EXPLORE.search}>キーワードで探す</TextLink>
            <TextLink to={EXPLORE.regions}>まちを探す</TextLink>
          </>
        }
      />
    </>
  );
}
