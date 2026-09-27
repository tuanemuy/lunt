"use client";

import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ManageBody } from "@/components/layout/ManageShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import {
  listNotificationsFn,
  NOTIFICATION_PAGE_SIZE,
  type NotificationItem,
  type NotificationPage,
} from "@/presentation/notificationList";
import { formatNotificationTime } from "@/presentation/notificationTime";

function Row({ item, now }: { item: NotificationItem; now: Date }) {
  const text = (
    <span className="m-list__text">
      <span className="m-list__title">{item.title}</span>
      {item.meta === "" ? null : (
        <span className="m-list__meta">{item.meta}</span>
      )}
      <time className="my03-time" dateTime={item.createdAt}>
        {formatNotificationTime(new Date(item.createdAt), now)}
      </time>
    </span>
  );
  // Plain anchors: the destinations carry their own query strings, and
  // several belong to screens of later stages.
  return (
    <li>
      {item.href === null ? (
        <div className="m-list__item my03-item--static">{text}</div>
      ) : (
        <a className="m-list__item" href={item.href}>
          {text}
          <Icon name="chevron" className="my03-chev" />
        </a>
      )}
    </li>
  );
}

function appendNew(
  current: readonly NotificationItem[],
  more: readonly NotificationItem[],
): readonly NotificationItem[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...more.filter((item) => !seen.has(item.id))];
}

/**
 * MY-03 通知一覧: the notifications newest first, loading the next page as
 * the end of the list comes into view (CF-05). Pages are fetched by offset,
 * so a notification arriving meanwhile may repeat on the next page; repeats
 * are dropped by id.
 */
export function NotificationList({ first }: { first: NotificationPage }) {
  const [items, setItems] = useState(first.items);
  const [count, setCount] = useState(first.count);
  const [loadedPages, setLoadedPages] = useState(1);
  const [failure, setFailure] = useState<ErrorState | null>(null);
  const failed = failure !== null;
  const navigate = useNavigate();
  const here = useLocation({ select: (location) => location.href });
  const [loading, startLoading] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const now = new Date(first.now);
  const hasMore = loadedPages * NOTIFICATION_PAGE_SIZE < count;

  const loadMore = useCallback(() => {
    startLoading(async () => {
      try {
        const page = await listNotificationsFn({
          data: { page: loadedPages + 1, limit: NOTIFICATION_PAGE_SIZE },
        });
        setItems((current) => appendNew(current, page.items));
        setCount(page.count);
        setLoadedPages((pages) => pages + 1);
        setFailure(null);
      } catch (error) {
        const state = classifyError(error);
        // The session ended while reading (CS-04): log in and come back.
        if (state.kind === "loginRequired") {
          await navigate({ to: "/login", search: { next: here } });
          return;
        }
        setFailure(state);
      }
    });
  }, [loadedPages, navigate, here]);

  useEffect(() => {
    const target = sentinel.current;
    if (target === null || !hasMore || failed || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, failed, loading, loadMore]);

  if (items.length === 0) {
    return (
      <ManageBody>
        <EmptyPanel
          title="通知はまだありません"
          actions={
            <ButtonLink variant="secondary" to="/me">
              マイページへ戻る
            </ButtonLink>
          }
        >
          申請の結果や、管理メンバーへの招待、確認の依頼などが届くと、ここに新しい順に並びます。通知は、アカウントのメールアドレスにも届きます。
        </EmptyPanel>
      </ManageBody>
    );
  }

  return (
    <ManageBody>
      <p className="my-lead">
        新しい順に並びます。店舗・地域・イベントの管理や役割に届いた通知も、ここにまとめて届きます。
      </p>
      <ul className="m-list my03-list" aria-busy={loading}>
        {items.map((item) => (
          <Row key={item.id} item={item} now={now} />
        ))}
      </ul>
      {failure !== null ? (
        <div role="alert">
          <Notice
            variant="manage"
            title="続きの通知を読み込めませんでした"
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
      ) : (
        <p className="my03-end">これより前の通知はありません</p>
      )}
    </ManageBody>
  );
}
