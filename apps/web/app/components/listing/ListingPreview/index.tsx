"use client";

import { useRouter } from "@tanstack/react-router";
import { useState, useTransition } from "react";
import { DetailPhotos } from "@/components/detail/DetailPhotos";
import { ListingCardBody } from "@/components/detail/ListingCard";
import { ListingHeroText } from "@/components/detail/ListingHero";
import { ManageBody } from "@/components/layout/ManageShell";
import {
  listingPagePath,
  placePagePath,
  ShopPage,
} from "@/components/manage/ShopShell";
import { usePlaceFrame } from "@/components/manage/ShopShell/usePlaceFrame";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { transitionListingFn } from "@/presentation/listing";
import type { ListingPreviewData } from "@/presentation/listingView";
import { useReconcile } from "@/presentation/reconcile";

const MISSING_WORD: Readonly<Record<string, string>> = {
  photos: "写真",
  name: "名称",
  category: "カテゴリー",
};

type Outcome = "published" | "missing" | "lostAccess";

/**
 * CM-03 公開前の確認 of a store's listing (LST-04, LST-15): the saved
 * content as viewers would see it — the detail and the list card — and
 * the publish (re-publish) shared with SM-04 (CF-08). Leaving without
 * publishing changes nothing.
 */
export function ListingPreview({ data }: { data: ListingPreviewData }) {
  const frame = usePlaceFrame();
  const router = useRouter();
  const reconcile = useReconcile();
  const proxy = frame.basis === "proxy";
  const params = { placeId: frame.placeId, listingId: data.id };
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failure, setFailure] = useState<ErrorState | null>(null);
  const [publishing, startPublish] = useTransition();
  const name = data.name ?? "名称未設定";
  const alreadyPublished = data.publication.status === "published";
  const canPublish = !alreadyPublished && !data.suspended;

  const publish = () =>
    startPublish(async () => {
      setFailure(null);
      try {
        await transitionListingFn({
          data: { listingId: data.id, transition: "publish" },
        });
        setOutcome("published");
        await reconcile();
      } catch (error) {
        const state = classifyError(error);
        if (state.kind === "notFound") {
          setOutcome("missing");
          return;
        }
        if (state.kind === "forbidden" && !proxy) {
          setOutcome("lostAccess");
          router.clearCache();
          return;
        }
        setFailure(state);
        if (state.kind === "premiseChanged") await reconcile();
      }
    });

  const editLink = (
    <ButtonLink
      variant="secondary"
      to="/manage/places/$placeId/listings/$listingId"
      params={params}
    >
      編集に戻る
    </ButtonLink>
  );

  if (outcome === "missing" || outcome === "lostAccess") {
    return (
      <ShopPage frame={frame} heading="公開前プレビュー">
        <ManageBody>
          <FocusOnMount role="alert">
            {outcome === "missing" ? (
              <EmptyPanel
                title="この掲載は削除されています"
                actions={
                  <ButtonLink
                    to="/manage/places/$placeId/listings"
                    params={{ placeId: frame.placeId }}
                  >
                    掲載の一覧へ戻る
                  </ButtonLink>
                }
              >
                掲載がないため、公開していません。
              </EmptyPanel>
            ) : (
              <EmptyPanel
                title="この店舗の店舗管理者ではありません"
                actions={<ButtonLink to="/me">マイページへ</ButtonLink>}
              >
                この掲載の確認と公開は、店舗管理者だけが行えます。公開はしていません。
              </EmptyPanel>
            )}
          </FocusOnMount>
        </ManageBody>
      </ShopPage>
    );
  }

  if (outcome === "published") {
    return (
      <ShopPage frame={frame} heading="公開前プレビュー">
        <FocusOnMount>
          <DonePanel
            title="公開しました"
            actions={
              <>
                <ButtonLink to={listingPagePath(data.id)}>
                  掲載詳細を見る
                </ButtonLink>
                <ButtonLink
                  variant="secondary"
                  to={placePagePath(frame.placeId)}
                >
                  店舗ページを見る
                </ButtonLink>
                {proxy ? (
                  <ButtonLink
                    variant="secondary"
                    to="/manage/places/$placeId/listings"
                    params={{ placeId: frame.placeId }}
                  >
                    掲載の一覧へ
                  </ButtonLink>
                ) : (
                  <ButtonLink
                    variant="secondary"
                    to="/manage/places/$placeId"
                    params={{ placeId: frame.placeId }}
                  >
                    店舗ホームに戻る
                  </ButtonLink>
                )}
              </>
            }
          >
            {data.placeSuspended
              ? `${name}を公開しました。店舗の非公開が解除されると、閲覧者に表示されます。`
              : `${name}を公開しました。店舗ページと掲載詳細から見られます。`}
          </DonePanel>
        </FocusOnMount>
      </ShopPage>
    );
  }

  return (
    <ShopPage
      frame={frame}
      heading="公開前プレビュー"
      actions={
        canPublish ? (
          <>
            <Button disabled={publishing} onClick={publish}>
              {publishing
                ? "公開しています…"
                : data.publication.status === "unpublished"
                  ? "この内容で再公開"
                  : "この内容で公開"}
            </Button>
            {editLink}
          </>
        ) : (
          editLink
        )
      }
    >
      <ManageBody>
        {failure === null ? null : failure.kind === "invalidInput" &&
          failure.missing.length > 0 ? (
          <Alert title="公開できませんでした" actions={editLink}>
            {`写真・名称・カテゴリーは、掲載を公開するための条件です。${failure.missing
              .map((item) => MISSING_WORD[item] ?? item)
              .join("・")}がありません。掲載の編集で直してください。`}
          </Alert>
        ) : failure.kind === "forbidden" ? (
          <Alert
            title="この店舗は代行できません"
            actions={
              <ButtonLink
                variant="secondary"
                to="/ops/subjects/$kind/$id"
                params={{ kind: "place", id: frame.placeId }}
              >
                店舗の運営へ戻る
              </ButtonLink>
            }
          >
            この店舗には店舗管理者が就きました。掲載は公開していません。店舗の運営の画面で、管理者がいることを確かめてください。
          </Alert>
        ) : (
          <Alert
            title="公開できませんでした"
            {...(failure.kind === "failed"
              ? {
                  actions: (
                    <Button
                      variant="secondary"
                      disabled={publishing}
                      onClick={publish}
                    >
                      もう一度公開
                    </Button>
                  ),
                }
              : {})}
          >
            {failure.kind === "failed"
              ? "通信を確かめて、もう一度公開してください。"
              : failure.message}
          </Alert>
        )}
        {alreadyPublished ? (
          <Notice
            variant="manage"
            tone="paper"
            title="この掲載は、すでに公開されています"
          >
            いまの公開状態は「公開中」です。内容の変更は、掲載の編集で行えます。
          </Notice>
        ) : null}
        {data.suspended ? (
          <Notice
            variant="manage"
            tone="paper"
            title="運営により非公開になっているため、公開できません"
          >
            解除できるのはサービス運営者だけです。見え方の確認と、内容の編集はいつもどおり行えます。
          </Notice>
        ) : null}
        {data.placeSuspended ? (
          <Notice
            variant="manage"
            tone="paper"
            title={`${data.placeName}は非公開になっています`}
          >
            公開はできますが、店舗の非公開が解除されるまで、閲覧者には表示されません。
          </Notice>
        ) : null}

        <p className="cm03-meta">見る人には、このように表示されます。</p>

        <p className="cm03-label">掲載詳細</p>
        <div className="detail cm03-detail">
          {data.hero.photos.length === 0 ? (
            <p className="cm03-missing">写真が登録されていません</p>
          ) : (
            <DetailPhotos photos={data.hero.photos} />
          )}
          <ListingHeroText hero={data.hero} nameAs="p" />
        </div>

        <p className="cm03-label">一覧のカード</p>
        <div className="card-grid cm03-cards">
          <article className="card">
            <div className="card__link">
              <ListingCardBody item={data.card} />
            </div>
          </article>
        </div>

        <Notice variant="manage" title="公開先">
          店舗ページと掲載詳細に表示されます。フィード・地図・検索にも、条件に合うときに表示されます。
        </Notice>
      </ManageBody>
    </ShopPage>
  );
}
