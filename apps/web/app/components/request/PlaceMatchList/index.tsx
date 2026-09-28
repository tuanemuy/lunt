"use client";

import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Notice } from "@/components/ui/Notice";
import { Photo } from "@/components/ui/Photo";
import {
  matchPlacesFn,
  PLACE_MATCH_PAGE_SIZE,
  type PlaceMatchItem,
  type PlaceMatchPage,
} from "@/presentation/findPlace";
import { OPERATING_STATUS_TEXT } from "@/presentation/placeView";

function appendNew(
  current: readonly PlaceMatchItem[],
  more: readonly PlaceMatchItem[],
): readonly PlaceMatchItem[] {
  const seen = new Set(current.map((item) => item.placeId));
  return [...current, ...more.filter((item) => !seen.has(item.placeId))];
}

function MatchRow({ item }: { item: PlaceMatchItem }) {
  return (
    <li>
      <Link
        className="m-row"
        to="/places/$placeId"
        params={{ placeId: item.placeId }}
      >
        <Photo
          photo={item.photo}
          alt=""
          ratio={1}
          className="m-row__photo"
          emptyLabel="写真なし"
        />
        <span className="m-row__content">
          <span className="m-row__name">{item.name}</span>
          <span className="m-row__meta">{item.address}</span>
          <span
            className="m-row__sub rq01-row-state"
            {...(item.operating === "open" ? {} : { "data-tone": "quiet" })}
          >
            {OPERATING_STATUS_TEXT[item.operating]}
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Registering a new store (RQ-02) arrives with the application stage
 * (S2B); until then the entry says so instead of leading anywhere.
 */
function RegisterEntry() {
  return (
    <Notice variant="manage" tone="paper" title="見つからないお店の登録">
      Lunt
      にまだ無いお店は、新しく登録を申請できるようになります。登録の申請は、まもなく受け付けを始めます。
    </Notice>
  );
}

function termsText(name: string | null, address: string | null): string {
  return [name, address].filter((term) => term !== null).join("・");
}

/**
 * RQ-01's results: the matching public places by relevance, each with its
 * operating status (reference scene), opening DT-02 — where any procedure
 * for it starts. Further pages load as the end comes into view (CF-05).
 */
export function PlaceMatchList({
  name,
  address,
  first,
}: {
  name: string | null;
  address: string | null;
  first: PlaceMatchPage;
}) {
  const [items, setItems] = useState(
    first.kind === "results" ? first.items : [],
  );
  const [count, setCount] = useState(
    first.kind === "results" ? first.count : 0,
  );
  const [pages, setPages] = useState(1);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = pages * PLACE_MATCH_PAGE_SIZE < count;

  const loadMore = useCallback(() => {
    startLoading(async () => {
      try {
        const page = await matchPlacesFn({
          data: { name, address, page: pages + 1 },
        });
        if (page.kind !== "results") return;
        setItems((current) => appendNew(current, page.items));
        setCount(page.count);
        setPages((loaded) => loaded + 1);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    });
  }, [name, address, pages]);

  useEffect(() => {
    const target = sentinel.current;
    if (target === null || !hasMore || failed || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, failed, loading, loadMore]);

  if (first.kind === "invalid") {
    return (
      <div role="alert">
        <EmptyPanel title="店名か住所を入力してください">
          名称も所在地も入力されていないため、探せません。店名か住所を入力してから探してください。
        </EmptyPanel>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <>
        <div role="status">
          <EmptyPanel
            title={`「${termsText(name, address)}」に一致するお店はありません`}
          >
            店名か住所の語を変えて、探し直せます。Lunt
            にまだ無いお店は、新しく登録を申請できます。
          </EmptyPanel>
        </div>
        <RegisterEntry />
      </>
    );
  }
  return (
    <>
      <section className="m-section" aria-labelledby="rq01-results">
        <h2 className="sr-only" id="rq01-results">
          検索結果
        </h2>
        <ul className="m-rows" aria-busy={loading}>
          {items.map((item) => (
            <MatchRow key={item.placeId} item={item} />
          ))}
        </ul>
        {failed ? (
          <div role="alert">
            <Notice
              variant="manage"
              title="続きを読み込めませんでした"
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
              通信を確かめて、もう一度読み込んでください。
            </Notice>
          </div>
        ) : hasMore ? (
          <div ref={sentinel}>
            <Button variant="secondary" onClick={loadMore} disabled={loading}>
              {loading ? "読み込んでいます…" : "続きを読み込む"}
            </Button>
          </div>
        ) : (
          <p className="rq01-end">{`一致するお店は以上です（${count}件）`}</p>
        )}
      </section>
      <div className="m-section">
        <p className="rq01-ask">このお店の管理者ですか？</p>
        <p className="m-field__help">
          お店を選んで店舗ページを開き、「このお店を管理する」から管理権限を申請できます。
        </p>
      </div>
      <RegisterEntry />
    </>
  );
}
