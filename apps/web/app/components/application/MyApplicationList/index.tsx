"use client";

import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ManageBody } from "@/components/layout/ManageShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChipLink } from "@/components/ui/ChipButton";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import { STATUS_LABEL, STATUS_TONE } from "@/presentation/applicationWords";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import {
  listMyApplicationsFn,
  MY_APPLICATIONS_PAGE_SIZE,
  type MyApplicationItem,
  type MyApplicationsPage,
} from "@/presentation/myApplications";

function Row({ item }: { item: MyApplicationItem }) {
  return (
    <li>
      <Link
        className="m-list__item"
        to="/me/applications/$applicationId"
        params={{ applicationId: item.id }}
      >
        <span className="m-list__text">
          <span className="my04-head">
            <Badge tone={STATUS_TONE[item.status]}>
              {STATUS_LABEL[item.status]}
            </Badge>
            <span className="m-list__title">{item.title}</span>
          </span>
          <span className="m-list__meta">{item.meta}</span>
          {item.notes.length === 0 ? null : (
            <span className="m-row__sub">{item.notes.join(" · ")}</span>
          )}
        </span>
        <Icon name="chevron" className="my04-chev" />
      </Link>
    </li>
  );
}

function appendNew(
  current: readonly MyApplicationItem[],
  more: readonly MyApplicationItem[],
): readonly MyApplicationItem[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...more.filter((item) => !seen.has(item.id))];
}

/** CS-09: where applications start (「申請を始める入口を持たない」). */
function Empty() {
  return (
    <ManageBody>
      <EmptyPanel title="申請はまだありません">
        申請は、この一覧からではなく、次の画面から始めます。
      </EmptyPanel>
      <LinkList>
        <li>
          <ListRowLink
            to="/apply/find-place"
            title="店舗を探す"
            meta="新しい店舗の登録、店舗の管理権限の申請"
          />
        </li>
        <li>
          <ListRowLink
            to="/"
            title="店舗・地域・イベントの詳細"
            meta="管理者のいない店舗の情報修正・掲載、地域への所属、イベントへの参加"
          />
        </li>
        <li>
          <ListRowLink
            to="/me"
            title="店舗の管理"
            meta="店舗管理者として行う地域への所属・離脱、イベントへの参加（マイページの管理する店舗から）"
          />
        </li>
      </LinkList>
    </ManageBody>
  );
}

/**
 * MY-04 自分の申請の一覧: the viewer's applications newest first, loading
 * the next page as the end of the list comes into view (CF-05). Narrowed
 * to a store (「店舗の申請」), a chip takes the filter off.
 */
export function MyApplicationList({ first }: { first: MyApplicationsPage }) {
  const [items, setItems] = useState(first.items);
  const [count, setCount] = useState(first.count);
  const [loadedPages, setLoadedPages] = useState(1);
  const [failure, setFailure] = useState<ErrorState | null>(null);
  const failed = failure !== null;
  const navigate = useNavigate();
  const here = useLocation({ select: (location) => location.href });
  const [loading, startLoading] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = loadedPages * MY_APPLICATIONS_PAGE_SIZE < count;
  const place = first.place;

  const loadMore = useCallback(() => {
    startLoading(async () => {
      try {
        const page = await listMyApplicationsFn({
          data: {
            place: place?.id ?? null,
            page: loadedPages + 1,
            limit: MY_APPLICATIONS_PAGE_SIZE,
          },
        });
        setItems((current) => appendNew(current, page.items));
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
  }, [loadedPages, navigate, here, place]);

  useEffect(() => {
    const target = sentinel.current;
    if (target === null || !hasMore || failed || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, failed, loading, loadMore]);

  const placeName = place?.name ?? "この店舗";

  if (items.length === 0 && place === null) return <Empty />;

  return (
    <ManageBody>
      {place === null ? (
        <p className="my-lead">
          個人として行った申請と、管理する店舗の店舗管理者として行った申請です。同じ店舗の別の店舗管理者が出した申請も含みます。新しい順に並びます。
        </p>
      ) : (
        <>
          <div className="my04-filter">
            <span className="my04-filter__label">絞り込み</span>
            <ChipLink
              className="my04-chip"
              to="/me/applications"
              aria-label={`${placeName} の絞り込みを外す`}
            >
              {placeName} の申請
              <Icon name="close" />
            </ChipLink>
          </div>
          <p className="my-lead">
            {placeName}{" "}
            の店舗管理者として行った申請です。別の店舗管理者が出した申請も含みます。
          </p>
        </>
      )}
      {items.length === 0 ? (
        <EmptyPanel title="この店舗の申請はまだありません">
          店舗管理者として行う地域への所属・離脱、イベントへの参加の申請が、ここに並びます。絞り込みを外すと、個人として行った申請も確かめられます。
        </EmptyPanel>
      ) : (
        <ul className="m-list my04-list" aria-busy={loading}>
          {items.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </ul>
      )}
      {failure !== null ? (
        <div role="alert">
          <Notice
            variant="manage"
            title="続きの申請を読み込めませんでした"
            actions={
              <Button variant="secondary" onClick={loadMore} disabled={loading}>
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
          <Button variant="secondary" onClick={loadMore} disabled={loading}>
            {loading ? "読み込んでいます…" : "続きを読み込む"}
          </Button>
        </div>
      ) : items.length === 0 ? null : (
        <p className="my04-end">これより前の申請はありません</p>
      )}
    </ManageBody>
  );
}
