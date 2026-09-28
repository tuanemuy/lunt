"use client";

import { useRouter } from "@tanstack/react-router";
import { type RefObject, useCallback, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChipLink } from "@/components/ui/ChipButton";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { ErrorState } from "@/presentation/errorState";
import {
  offeringPhaseLabel,
  publicationLabel,
} from "@/presentation/listingView";
import {
  type ListingMatchItem,
  type MatchPage,
  OPS_SEARCH_PAGE_SIZE,
  type PlaceMatchItem,
  searchListingsFn,
  searchPlacesFn,
} from "@/presentation/opsSearch";
import { OPERATING_STATUS_LABEL } from "@/presentation/placeView";
import { useLoadMore } from "./useLoadMore";

function Footer({
  hasMore,
  failure,
  loading,
  loadMore,
  sentinel,
}: {
  hasMore: boolean;
  failure: ErrorState | null;
  loading: boolean;
  loadMore: () => void;
  sentinel: RefObject<HTMLDivElement | null>;
}) {
  if (failure !== null) {
    return (
      <div role="alert">
        <Notice
          variant="manage"
          title="続きの結果を読み込めませんでした"
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
    );
  }
  return hasMore ? (
    <div ref={sentinel}>
      <p className="om02-end" role="status">
        {loading ? "続きを読み込んでいます" : ""}
      </p>
    </div>
  ) : (
    <p className="om02-end">結果は以上です</p>
  );
}

function StewardCell({ hasSteward }: { hasSteward: boolean }) {
  return (
    <td data-label="管理者">
      <span>
        {hasSteward ? "店舗管理者あり" : <Badge tone="alert">管理者なし</Badge>}
      </span>
    </td>
  );
}

const placeKey = (item: PlaceMatchItem) => item.placeId;
const listingKey = (item: ListingMatchItem) => item.listingId;

/**
 * OM-02 店舗の結果: each store with its state and whether it has a
 * steward; OM-03 for every store, the absence proxy entries (SM-02, SM-03,
 * SM-04 新規) only for stores without one. The proxy registration is
 * offered once the operator has seen the results.
 */
export function PlaceResults({
  first,
  name,
  address,
}: {
  first: MatchPage<PlaceMatchItem>;
  name: string;
  address: string;
}) {
  const fetchPage = useCallback(
    (page: number) =>
      searchPlacesFn({
        data: { name, address, page, limit: OPS_SEARCH_PAGE_SIZE },
      }),
    [name, address],
  );
  const list = useLoadMore(first, OPS_SEARCH_PAGE_SIZE, placeKey, fetchPage);
  const terms = [name, address].filter((term) => term !== "").join("・");
  const register = (
    <ButtonLink variant="secondary" to="/manage/places/new">
      見つからないので代理登録
    </ButtonLink>
  );

  if (list.items.length === 0) {
    return (
      <section className="m-section" aria-labelledby="om02-empty">
        <hr className="m-divider" />
        <EmptyPanel
          titleId="om02-empty"
          title={`「${terms}」に合う店舗はありません`}
          actions={register}
        >
          非公開の店舗を含めて探しました。名称や所在地を変えて探し直すか、同じ店舗がないことを確かめて代理登録します。
        </EmptyPanel>
      </section>
    );
  }
  return (
    <section className="m-section" aria-labelledby="om02-places">
      <hr className="m-divider" />
      <div className="om-count">
        <SectionTitle variant="manage" id="om02-places">
          {`「${terms}」の店舗`}
        </SectionTitle>
        <Badge>{`${list.count}件`}</Badge>
      </div>
      <table className="om-table" aria-busy={list.loading}>
        <thead>
          <tr>
            <th scope="col">店舗と所在地</th>
            <th scope="col">状態</th>
            <th scope="col">管理者</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          {list.items.map((place) => {
            const params = { placeId: place.placeId };
            return (
              <tr key={place.placeId}>
                <th scope="row">
                  <span className="om-table__title">{place.name}</span>
                  <span className="om-table__sub">{place.address}</span>
                </th>
                <td data-label="状態">
                  <span>
                    {`${OPERATING_STATUS_LABEL[place.operatingStatus]} · `}
                    {place.suspended ? (
                      <strong className="om02-flag">店舗は非公開</strong>
                    ) : (
                      "公開中"
                    )}
                  </span>
                </td>
                <StewardCell hasSteward={place.hasSteward} />
                <td className="om-table__ops">
                  <div className="om-table__opsbox">
                    <ChipLink
                      to="/ops/subjects/$kind/$id"
                      params={{ kind: "place", id: place.placeId }}
                    >
                      対象の運営
                    </ChipLink>
                    {place.hasSteward ? null : (
                      <>
                        <ChipLink
                          to="/manage/places/$placeId/info"
                          params={params}
                        >
                          店舗情報を代行
                        </ChipLink>
                        <ChipLink
                          to="/manage/places/$placeId/listings"
                          params={params}
                        >
                          掲載を代行
                        </ChipLink>
                        <ChipLink
                          to="/manage/places/$placeId/listings/new"
                          params={params}
                        >
                          掲載を追加（代行）
                        </ChipLink>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Footer {...list} />
      <Notice
        variant="manage"
        tone="paper"
        title="登録したい店舗が見つからないとき"
        actions={register}
      >
        非公開の店舗を含めて、同じ店舗がないことを結果で確かめてから、サービス運営者として代理登録します。
      </Notice>
    </section>
  );
}

/** OM-02 掲載の結果: each listing with its store, states and steward. */
export function ListingResults({
  first,
  keyword,
}: {
  first: MatchPage<ListingMatchItem>;
  keyword: string;
}) {
  const fetchPage = useCallback(
    (page: number) =>
      searchListingsFn({
        data: { q: keyword, page, limit: OPS_SEARCH_PAGE_SIZE },
      }),
    [keyword],
  );
  const list = useLoadMore(first, OPS_SEARCH_PAGE_SIZE, listingKey, fetchPage);

  if (list.items.length === 0) {
    return (
      <section className="m-section" aria-labelledby="om02-empty">
        <hr className="m-divider" />
        <EmptyPanel
          titleId="om02-empty"
          title={`「${keyword}」に合う掲載はありません`}
        >
          閲覧者に表示されていないものを含めて探しました。キーワードを変えて探し直してください。
        </EmptyPanel>
      </section>
    );
  }
  return (
    <section className="m-section" aria-labelledby="om02-listings">
      <hr className="m-divider" />
      <div className="om-count">
        <SectionTitle variant="manage" id="om02-listings">
          {`「${keyword}」の掲載`}
        </SectionTitle>
        <Badge>{`${list.count}件`}</Badge>
      </div>
      <table className="om-table" aria-busy={list.loading}>
        <thead>
          <tr>
            <th scope="col">掲載と店舗</th>
            <th scope="col">状態</th>
            <th scope="col">管理者</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          {list.items.map((listing) => (
            <tr key={listing.listingId}>
              <th scope="row">
                <span className="om-table__title">
                  {listing.name ?? "名称未設定"}
                </span>
                <span className="om-table__sub">
                  {listing.placeName ?? "店舗が見つかりません"}
                </span>
              </th>
              <td data-label="状態">
                <span>
                  {`${publicationLabel(listing.publication)} · ${offeringPhaseLabel(listing.offeringStatus)}`}
                  {listing.suspended ? (
                    <>
                      {" · "}
                      <strong className="om02-flag">運営による非公開</strong>
                    </>
                  ) : null}
                </span>
              </td>
              <StewardCell hasSteward={listing.hasSteward} />
              <td className="om-table__ops">
                <div className="om-table__opsbox">
                  <ChipLink
                    to="/ops/subjects/$kind/$id"
                    params={{ kind: "listing", id: listing.listingId }}
                  >
                    対象の運営
                  </ChipLink>
                  {listing.hasSteward ? null : (
                    <ChipLink
                      to="/manage/places/$placeId/listings/$listingId"
                      params={{
                        placeId: listing.placeId,
                        listingId: listing.listingId,
                      }}
                    >
                      掲載を代行
                    </ChipLink>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Footer {...list} />
    </section>
  );
}

function RetrySearch() {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={retrying}
      onClick={() =>
        startRetry(async () => {
          await router.invalidate({ sync: true });
        })
      }
    >
      {retrying ? "探しています…" : "もう一度探す"}
    </Button>
  );
}

/** A search the server could not run (CS-02, or a term it refused). */
export function SearchFailure({
  kind,
  message,
}: {
  kind: ErrorState["kind"];
  message: string;
}) {
  return (
    <div role="alert">
      <Notice
        variant="manage"
        title="探せませんでした"
        {...(kind === "failed" ? { actions: <RetrySearch /> } : {})}
      >
        {kind === "failed"
          ? "通信を確かめて、もう一度探してください。入力した内容は残っています。"
          : message}
      </Notice>
    </div>
  );
}
