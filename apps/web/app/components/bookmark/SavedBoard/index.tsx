"use client";

import { Link } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { ListingCardBody } from "@/components/detail/ListingCard";
import {
  entryMemory,
  useHistoryEntryKey,
} from "@/components/explore/entryMemory";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Photo } from "@/components/ui/Photo";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  listAccountSavedFn,
  removeBookmarkFn,
  resolveDeviceSavedFn,
  saveBookmarkFn,
} from "@/presentation/bookmark";
import {
  deviceMerger,
  deviceSaves,
  useDeviceSaves,
  useMergeStatus,
} from "@/presentation/deviceSaveStore";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { OPERATING_STATUS_TEXT } from "@/presentation/placeView";
import { useReconcile } from "@/presentation/reconcile";
import {
  SAVED_PAGE_SIZE,
  type SavedItem,
  type SavedPage,
  type SaveTarget,
  saveKey,
} from "@/presentation/savedView";
import { SavedEmpty, SavedLoginLink } from "../SavedFeedback";
import { SavedTitle } from "../SavedSkeleton";
import {
  SaveButton,
  type SaveToggleState,
  useMergeDeviceSaves,
} from "../SaveToggle";

/**
 * Where VW-10's saves come from: the signed-in account (`listBookmarks`,
 * a page at a time), or this browser's device saves, in saved order
 * (resolved a page at a time).
 */
export type SavedSource =
  | Readonly<{ mode: "account" }>
  | Readonly<{ mode: "device"; order: readonly SaveTarget[] }>;

/** What the list had, kept per history entry for the way back from a detail. */
type BoardMemory = Readonly<{
  first: SavedPage;
  later: readonly SavedItem[];
  pages: number;
  removed: ReadonlySet<string>;
}>;

const boardMemory = entryMemory<BoardMemory>();

async function fetchPage(
  source: SavedSource,
  page: number,
): Promise<SavedPage> {
  if (source.mode === "account") {
    return listAccountSavedFn({ data: { page } });
  }
  const start = (page - 1) * SAVED_PAGE_SIZE;
  const items = await resolveDeviceSavedFn({
    data: { targets: source.order.slice(start, start + SAVED_PAGE_SIZE) },
  });
  return { items, count: source.order.length };
}

type RowFailure = Readonly<{
  name: string;
  action: "save" | "remove";
  error: ErrorState | null;
}>;

type Mark = Readonly<{ key: string; removed: boolean }>;

const applyMark = (
  current: ReadonlySet<string>,
  { key, removed }: Mark,
): ReadonlySet<string> => {
  const next = new Set(current);
  if (removed) next.add(key);
  else next.delete(key);
  return next;
};

const rowName = (item: SavedItem): string => {
  switch (item.view) {
    case "listing":
      return item.card.name;
    case "place":
      return item.place.name;
    case "unavailable":
      return item.target.kind === "listing"
        ? "閲覧できない掲載"
        : "閲覧できないお店";
  }
};

function toggleLabel(item: SavedItem, removed: boolean): string {
  const name = rowName(item);
  return removed ? `${name}を保存し直す` : `${name}の保存を解除`;
}

function RemovedNote() {
  return <p className="card__removed">保存を解除しました</p>;
}

function placeMeta(item: Extract<SavedItem, { view: "place" }>): string {
  const { operating } = item.place;
  return operating === "open"
    ? "店舗"
    : `店舗・${OPERATING_STATUS_TEXT[operating]}`;
}

/** One row: a listing card, a place row, or an unavailable save. */
function SavedRow({
  item,
  removed,
  toggle,
}: {
  item: SavedItem;
  removed: boolean;
  toggle: SaveToggleState;
}) {
  const button = (
    <SaveButton state={toggle} label={toggleLabel(item, removed)} />
  );
  switch (item.view) {
    case "listing":
      return (
        <li className={cx("card", removed && "card--removed")}>
          <Link
            className="card__link"
            to="/listings/$listingId"
            params={{ listingId: item.card.listingId }}
          >
            <ListingCardBody item={item.card} />
            {removed ? <RemovedNote /> : null}
          </Link>
          {button}
        </li>
      );
    case "place":
      return (
        <li className="saved-list__wide saved-list__row">
          <div className={cx("saved-row", removed && "saved-row--removed")}>
            <Link
              className="content-row"
              to="/places/$placeId"
              params={{ placeId: item.place.placeId }}
            >
              <Photo
                photo={item.place.photo}
                alt=""
                ratio={1}
                className="content-row__photo"
              />
              <div className="content-row__body">
                <p className="content-row__name">{item.place.name}</p>
                <p className="content-row__meta">{placeMeta(item)}</p>
                {removed ? <RemovedNote /> : null}
              </div>
            </Link>
            {button}
          </div>
        </li>
      );
    case "unavailable":
      return item.target.kind === "listing" ? (
        <li
          className={cx("card card--unavailable", removed && "card--removed")}
        >
          <div className="card__body">
            <div className="card__photo">
              <Icon name="bookmark" className="card__unavailable-icon" />
            </div>
            <p className="card__name">閲覧できない掲載</p>
            <p className="card__note">いまは詳細を開けません。</p>
            {removed ? <RemovedNote /> : null}
          </div>
          {button}
        </li>
      ) : (
        <li className="saved-list__wide saved-list__row">
          <div
            className={cx(
              "saved-row saved-row--unavailable",
              removed && "saved-row--removed",
            )}
          >
            <div className="content-row">
              <div className="content-row__photo">
                <Icon name="bookmark" className="card__unavailable-icon" />
              </div>
              <div className="content-row__body">
                <p className="content-row__name">閲覧できないお店</p>
                <p className="card__note">いまは詳細を開けません。</p>
                {removed ? <RemovedNote /> : null}
              </div>
            </div>
            {button}
          </div>
        </li>
      );
  }
}

/** 「端末の保存」's guide: device data, and signing in to keep them (KEP-02 7). */
function DeviceGuide() {
  return (
    <Notice title="この端末に保存しています" actions={<SavedLoginLink />}>
      端末のデータを消去すると、保存は失われます。ログインすると、保存をアカウントに引き継げます。
    </Notice>
  );
}

/**
 * The merge of this browser's device saves after the login (KEP-04): under
 * way, or 「引き継ぎの未了」 — the device keeps them and the merge can be
 * sent again. A merge that went through reloads the list.
 */
function MergeNotice() {
  const status = useMergeStatus();
  const device = useDeviceSaves();
  const reconcile = useReconcile();
  const [retrying, startRetry] = useTransition();
  const waiting = device !== null && device.length > 0;
  useMergeDeviceSaves(true);
  if (!waiting) return null;
  if (status.kind === "merging") {
    return (
      <Notice title="この端末の保存をアカウントに引き継いでいます">
        少しお待ちください。
      </Notice>
    );
  }
  if (status.kind !== "failed") return null;
  return (
    <Notice
      tone="error"
      title="保存をアカウントに引き継げませんでした"
      actions={
        <button
          className="text-button"
          type="button"
          disabled={retrying}
          onClick={() =>
            startRetry(async () => {
              await deviceMerger.mergeAndReconcile(reconcile);
            })
          }
        >
          もう一度引き継ぐ
        </button>
      }
    >
      この端末の保存は残っています。通信状況を確認して、もう一度お試しください。
    </Notice>
  );
}

function RowFailureNotice({ failure }: { failure: RowFailure }) {
  const title =
    failure.action === "remove"
      ? `「${failure.name}」の保存を解除できませんでした`
      : `「${failure.name}」を保存し直せませんでした`;
  const text =
    failure.error === null
      ? "この端末に保存を残せませんでした。ブラウザの設定で、サイトのデータの保存を許可してください。"
      : failure.error.kind === "failed"
        ? "通信状況を確認して、もう一度お試しください。"
        : failure.error.message;
  return (
    <Notice tone="error" title={title}>
      {text}
    </Notice>
  );
}

/**
 * VW-10's list (KEP-02, KEP-03): the saves newest first, listings as cards
 * and places as rows, unavailable ones without their name or photo; the
 * rest loads as the end comes into view (CF-05).
 *
 * It owns the rows: a row whose save is removed here stays in place,
 * marked 「保存を解除しました」, and can be saved again from there until the
 * screen is opened again (the route keeps no cache, so reopening reads the
 * list afresh). So a toggle here does not reload the list: signed in it
 * flips at once (`useOptimistic`) and puts the row back if the account
 * call fails; signed out it changes the device at once. Returning from a
 * detail to the same first page finds the loaded rows and marks as they were.
 */
export function SavedBoard({
  source,
  first,
}: {
  source: SavedSource;
  first: SavedPage;
}) {
  const entry = useHistoryEntryKey();
  const [kept] = useState(() => {
    const memory = boardMemory.recall(entry, source.mode);
    return memory?.first === first ? memory : undefined;
  });
  const [shownFirst, setShownFirst] = useState(first);
  const [later, setLater] = useState<readonly SavedItem[]>(kept?.later ?? []);
  const [pages, setPages] = useState(kept?.pages ?? 1);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(
    kept?.removed ?? new Set(),
  );
  const [pageFailure, setPageFailure] = useState(false);
  const [rowFailure, setRowFailure] = useState<RowFailure | null>(null);
  const [loading, startLoading] = useTransition();
  const [, startToggle] = useTransition();
  const [shownRemoved, markRemoved] = useOptimistic(removed, applyMark);
  const sentinel = useRef<HTMLDivElement>(null);
  const device = useDeviceSaves();
  const mergeWaiting =
    source.mode === "account" && device !== null && device.length > 0;

  // A reload (after the device saves merged) is a fresh list.
  if (first !== shownFirst) {
    setShownFirst(first);
    setLater([]);
    setPages(1);
    setRemoved(new Set());
    setPageFailure(false);
    setRowFailure(null);
  }

  useEffect(() => {
    boardMemory.remember(entry, source.mode, { first, later, pages, removed });
  }, [entry, source.mode, first, later, pages, removed]);

  const seen = new Set<string>();
  const items = [...first.items, ...later].filter((item) => {
    const key = saveKey(item.target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const hasMore = pages * SAVED_PAGE_SIZE < first.count;

  const loadMore = useCallback(() => {
    startLoading(async () => {
      try {
        const page = await fetchPage(source, pages + 1);
        setLater((current) => [...current, ...page.items]);
        setPages((loaded) => loaded + 1);
        setPageFailure(false);
      } catch {
        setPageFailure(true);
      }
    });
  }, [source, pages]);

  useEffect(() => {
    const target = sentinel.current;
    if (target === null || !hasMore || pageFailure || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, pageFailure, loading, loadMore]);

  const toggleOf = (item: SavedItem): SaveToggleState => {
    const key = saveKey(item.target);
    const isRemoved = shownRemoved.has(key);
    const pending = isRemoved !== removed.has(key);
    const toggle = () => {
      if (pending) return;
      const action = isRemoved ? "save" : "remove";
      const name = rowName(item);
      setRowFailure(null);
      if (source.mode === "device") {
        const kept =
          action === "remove"
            ? deviceSaves.remove(item.target)
            : deviceSaves.save(item.target, Date.now());
        if (kept)
          setRemoved((current) =>
            applyMark(current, { key, removed: !isRemoved }),
          );
        else setRowFailure({ name, action, error: null });
        return;
      }
      startToggle(async () => {
        markRemoved({ key, removed: !isRemoved });
        try {
          await (action === "remove" ? removeBookmarkFn : saveBookmarkFn)({
            data: item.target,
          });
          setRemoved((current) =>
            applyMark(current, { key, removed: !isRemoved }),
          );
        } catch (error) {
          setRowFailure({ name, action, error: classifyError(error) });
        }
      });
    };
    return { saved: !isRemoved, pending, failure: null, toggle };
  };

  if (first.count === 0 && items.length === 0) {
    // Saves still on their way from the device are not 「保存がない」.
    return mergeWaiting ? (
      <>
        <SavedTitle />
        <MergeNotice />
      </>
    ) : (
      <>
        {source.mode === "account" ? <MergeNotice /> : null}
        <SavedEmpty signedIn={source.mode === "account"} />
      </>
    );
  }

  return (
    <>
      <SavedTitle />
      {source.mode === "device" ? <DeviceGuide /> : <MergeNotice />}
      {rowFailure === null ? null : <RowFailureNotice failure={rowFailure} />}
      <ul className="card-grid saved-list" aria-busy={loading}>
        {items.map((item) => (
          <SavedRow
            key={saveKey(item.target)}
            item={item}
            removed={shownRemoved.has(saveKey(item.target))}
            toggle={toggleOf(item)}
          />
        ))}
      </ul>
      {pageFailure ? (
        <Notice
          tone="error"
          title="続きの保存を読み込めませんでした"
          actions={
            <button className="text-button" type="button" onClick={loadMore}>
              もう一度読み込む
            </button>
          }
        >
          通信状況を確認して、もう一度お試しください。
        </Notice>
      ) : loading ? (
        <div className="loading" role="status">
          <p className="loading__text">続きを読み込んでいます</p>
          <Skeleton className="saved-skeleton__name" />
        </div>
      ) : hasMore ? (
        <div ref={sentinel}>
          <Button variant="secondary" fit onClick={loadMore}>
            続きを読み込む
          </Button>
        </div>
      ) : (
        <p className="list-end">保存はここまでです</p>
      )}
    </>
  );
}
