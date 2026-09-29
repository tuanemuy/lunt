"use client";

import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ManageBody } from "@/components/layout/ManageShell";
import { listingPagePath, ShopPage } from "@/components/manage/ShopShell";
import { usePlaceFrame } from "@/components/manage/ShopShell/usePlaceFrame";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChipLink } from "@/components/ui/ChipButton";
import { CountTab, CountTabs } from "@/components/ui/CountTabs";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Notice } from "@/components/ui/Notice";
import { RowLink } from "@/components/ui/Rows";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { LISTING_PAGE_SIZE, listPlaceListingsFn } from "@/presentation/listing";
import {
  jpDate,
  LISTING_SHELF_LABEL,
  LISTING_SHELVES,
  type ListingRowItem,
  type ListingRowsPage,
  type ListingShelfCountsView,
  type ListingShelfKey,
} from "@/presentation/listingView";
import { ListingBadges } from "../ListingBadges";

const EMPTY_SHELF: Readonly<
  Record<ListingShelfKey, Readonly<{ title: string; body: string }>>
> = {
  published: {
    title: "公開中の掲載はありません",
    body: "下書きを公開すると、ここに並びます。上の区分から、別の区分を選べます。",
  },
  draft: {
    title: "下書きの掲載はありません",
    body: "掲載を追加して保存すると、下書きとしてここに並びます。上の区分から、別の区分を選べます。",
  },
  hidden: {
    title: "非公開の掲載はありません",
    body: "一時非公開の掲載も、運営による非公開の掲載もありません。上の区分から、別の区分を選べます。",
  },
  ended: {
    title: "提供終了の掲載はありません",
    body: "提供を終了した掲載はありません。上の区分から、別の区分を選べます。",
  },
};

function rowMeta(row: ListingRowItem): string {
  const status = row.offeringStatus;
  return [
    row.category ?? "カテゴリー未設定",
    ...(status.phase === "upcoming" ? [`${jpDate(status.startsOn)}から`] : []),
  ].join(" · ");
}

function Row({ row, viewable }: { row: ListingRowItem; viewable: boolean }) {
  const frame = usePlaceFrame();
  const name = row.name ?? "名称未設定";
  const shown =
    viewable && row.publication.status === "published" && !row.suspended;
  return (
    <li className="p-item">
      <RowLink
        to="/manage/places/$placeId/listings/$listingId"
        params={{ placeId: frame.placeId, listingId: row.id }}
        photo={row.cover?.url == null ? null : { src: row.cover.url, alt: "" }}
        name={name}
        meta={rowMeta(row)}
        sub={
          <span className="p-badges">
            <ListingBadges
              publication={row.publication}
              suspended={row.suspended}
              offeringStatus={row.offeringStatus}
            />
          </span>
        }
      />
      {shown ? (
        <div className="p-item__ops">
          <ChipLink to={listingPagePath(row.id)}>閲覧者に見える掲載</ChipLink>
        </div>
      ) : row.publication.status === "draft" ? null : (
        <p className="p-item__text">
          {row.suspended
            ? "閲覧者には表示されていません。運営による非公開は、サービス運営者だけが解除できます。"
            : row.publication.status === "unpublished"
              ? row.publication.reason === "photoTakedown"
                ? "申立てにより写真が削除され、一時非公開になっています。写真を登録して保存し、再公開すると、閲覧者に表示されます。"
                : "閲覧者には表示されていません。再公開は掲載の編集で行えます。"
              : "店舗の非公開が解除されるまで、閲覧者には表示されません。"}
        </p>
      )}
    </li>
  );
}

function appendNew(
  current: readonly ListingRowItem[],
  more: readonly ListingRowItem[],
): readonly ListingRowItem[] {
  const seen = new Set(current.map((row) => row.id));
  return [...current, ...more.filter((row) => !seen.has(row.id))];
}

/**
 * SM-03 掲載の一覧: every listing of the store in the chosen 区分, with each
 * 区分's count, loading the next page as the end comes into view (CF-05).
 * Pages are read by offset, so a listing saved meanwhile may repeat; repeats
 * are dropped by id.
 */
export function ListingRows({
  first,
  counts,
  status,
  deleted,
}: {
  first: ListingRowsPage;
  counts: ListingShelfCountsView;
  status: ListingShelfKey | null;
  deleted: boolean;
}) {
  const frame = usePlaceFrame();
  const params = { placeId: frame.placeId };
  const [rows, setRows] = useState(first.items);
  const [count, setCount] = useState(first.count);
  const [loadedPages, setLoadedPages] = useState(1);
  const [failure, setFailure] = useState<ErrorState | null>(null);
  const [loading, startLoading] = useTransition();
  const navigate = useNavigate();
  const here = useLocation({ select: (location) => location.href });
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = loadedPages * LISTING_PAGE_SIZE < count;
  const failed = failure !== null;

  useEffect(() => {
    setRows(first.items);
    setCount(first.count);
    setLoadedPages(1);
  }, [first]);

  const loadMore = useCallback(() => {
    startLoading(async () => {
      try {
        const page = await listPlaceListingsFn({
          data: {
            placeId: frame.placeId,
            ...(status === null ? {} : { status }),
            page: loadedPages + 1,
            limit: LISTING_PAGE_SIZE,
          },
        });
        setRows((current) => appendNew(current, page.items));
        setCount(page.count);
        setLoadedPages((pages) => pages + 1);
        setFailure(null);
      } catch (error) {
        const state = classifyError(error);
        if (state.kind === "loginRequired") {
          await navigate({ to: "/login", search: { next: here } });
          return;
        }
        setFailure(state);
      }
    });
  }, [frame.placeId, status, loadedPages, navigate, here]);

  useEffect(() => {
    const target = sentinel.current;
    if (target === null || !hasMore || failed || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, failed, loading, loadMore]);

  return (
    <ShopPage
      frame={frame}
      heading="掲載"
      actions={
        <ButtonLink to="/manage/places/$placeId/listings/new" params={params}>
          ＋ 掲載を追加
        </ButtonLink>
      }
    >
      <ManageBody>
        {deleted ? (
          <div role="status">
            <Notice variant="manage" title="掲載を削除しました">
              削除した掲載は、閲覧者に表示されなくなりました。元に戻すことはできません。
            </Notice>
          </div>
        ) : null}
        {frame.suspended ? (
          <Notice variant="manage" tone="paper" title="この店舗は非公開です">
            解除されるまで、店舗と掲載は閲覧者に表示されません。掲載の編集は、これまでどおり行えます。
          </Notice>
        ) : null}
        {counts.all === 0 ? (
          <EmptyPanel
            title="掲載はまだありません"
            actions={
              <ButtonLink
                variant="secondary"
                to="/manage/places/$placeId/listings/new"
                params={params}
              >
                掲載を追加する
              </ButtonLink>
            }
          >
            商品・体験・景色・見どころを、写真とともに掲載できます。下書きとして保存し、見え方を確かめてから公開できます。
          </EmptyPanel>
        ) : (
          <>
            <CountTabs label="掲載の区分">
              <CountTab
                to="/manage/places/$placeId/listings"
                params={params}
                search={{}}
                count={counts.all}
                activeOptions={{ exact: true, includeSearch: true }}
              >
                すべて
              </CountTab>
              {LISTING_SHELVES.map((shelf) => (
                <CountTab
                  key={shelf}
                  to="/manage/places/$placeId/listings"
                  params={params}
                  search={{ status: shelf }}
                  count={counts[shelf]}
                  activeOptions={{ exact: true, includeSearch: true }}
                >
                  {LISTING_SHELF_LABEL[shelf]}
                </CountTab>
              ))}
            </CountTabs>
            {rows.length === 0 && status !== null ? (
              <EmptyPanel
                title={EMPTY_SHELF[status].title}
                actions={
                  <ButtonLink
                    variant="secondary"
                    to="/manage/places/$placeId/listings"
                    params={params}
                    search={{}}
                  >
                    すべての掲載を見る
                  </ButtonLink>
                }
              >
                {EMPTY_SHELF[status].body}
              </EmptyPanel>
            ) : (
              <>
                <ul className="p-items" aria-busy={loading}>
                  {rows.map((row) => (
                    <Row key={row.id} row={row} viewable={!frame.suspended} />
                  ))}
                </ul>
                {failure !== null ? (
                  <div role="alert">
                    <Notice
                      variant="manage"
                      title="続きの掲載を読み込めませんでした"
                      actions={
                        <Button
                          variant="secondary"
                          onClick={loadMore}
                          disabled={loading}
                        >
                          もう一度読み込む
                        </Button>
                      }
                    >
                      {failure.kind === "failed"
                        ? "通信を確かめて、もう一度読み込んでください。"
                        : failure.message}
                    </Notice>
                  </div>
                ) : hasMore ? (
                  <div ref={sentinel}>
                    <p className="p-end" role="status">
                      {loading ? "続きを読み込んでいます" : ""}
                    </p>
                  </div>
                ) : (
                  <p className="p-end">すべての掲載を表示しました</p>
                )}
              </>
            )}
          </>
        )}
      </ManageBody>
    </ShopPage>
  );
}
