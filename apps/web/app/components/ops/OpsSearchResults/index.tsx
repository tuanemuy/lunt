"use client";

import { useRouter } from "@tanstack/react-router";
import { type RefObject, useCallback, useTransition } from "react";
import { regionProxyKey } from "@/components/region/RegionShell";
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
  type OccasionMatchItem,
  OPS_SEARCH_PAGE_SIZE,
  type PlaceMatchItem,
  type RegionMatchItem,
  searchListingsFn,
  searchOccasionsFn,
  searchPlacesFn,
  searchRegionsFn,
} from "@/presentation/opsSearch";
import { OPERATING_STATUS_LABEL } from "@/presentation/placeView";
import {
  HOLDING_STATUS_LABEL,
  regionPublicationLabel,
} from "@/presentation/regionView";
import { RegisterEntries } from "../OpsSearchForms";
import { rememberProxyVisit } from "../ProxyReturn";
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
      {loading ? null : (
        <Button variant="secondary" fit onClick={loadMore}>
          続きを読み込む
        </Button>
      )}
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

/** A region's or an event's operators: 地域運営者あり / 運営者なし. */
function OperatorCell({
  hasSteward,
  roleLabel,
}: {
  hasSteward: boolean;
  roleLabel: string;
}) {
  return (
    <td data-label="管理者">
      <span>
        {hasSteward ? (
          `${roleLabel}あり`
        ) : (
          <Badge tone="alert">運営者なし</Badge>
        )}
      </span>
    </td>
  );
}

/** 公開 · 開催前 (· 運営による非公開), the state cell of a region or an event. */
function StateCell({
  publication,
  suspended,
  holding,
}: {
  publication: RegionMatchItem["publication"];
  suspended: boolean;
  holding: string | null;
}) {
  return (
    <td data-label="状態">
      <span>
        {[
          regionPublicationLabel(publication),
          ...(holding === null ? [] : [holding]),
        ].join(" · ")}
        {suspended ? (
          <>
            {" · "}
            <strong className="om02-flag">運営による非公開</strong>
          </>
        ) : null}
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
                          onClick={() => rememberProxyVisit(place.placeId)}
                        >
                          店舗情報を代行
                        </ChipLink>
                        <ChipLink
                          to="/manage/places/$placeId/listings"
                          params={params}
                          onClick={() => rememberProxyVisit(place.placeId)}
                        >
                          掲載を代行
                        </ChipLink>
                        <ChipLink
                          to="/manage/places/$placeId/listings/new"
                          params={params}
                          onClick={() => rememberProxyVisit(place.placeId)}
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

const regionKey = (item: RegionMatchItem) => item.regionId;
const occasionKey = (item: OccasionMatchItem) => item.occasionId;

function useKeywordPage<T>(
  keyword: string,
  first: MatchPage<T>,
  keyOf: (item: T) => string,
  search: (
    input: Readonly<{ data: { q: string; page: number; limit: number } }>,
  ) => Promise<MatchPage<T>>,
) {
  const fetchPage = useCallback(
    (page: number) =>
      search({ data: { q: keyword, page, limit: OPS_SEARCH_PAGE_SIZE } }),
    [keyword, search],
  );
  return useLoadMore(first, OPS_SEARCH_PAGE_SIZE, keyOf, fetchPage);
}

/** One kind's further pages; the end is said once after all kinds. */
function KindFooter(props: Parameters<typeof Footer>[0]) {
  return props.hasMore || props.failure !== null ? <Footer {...props} /> : null;
}

function NoneOfKind({ label }: { label: string }) {
  return <p className="m-field__help">{`合う${label}はありません。`}</p>;
}

/**
 * OM-02 キーワードの結果: listings, regions and events, each kind in its
 * own table with its own further pages (CF-05); OM-03 for every target,
 * the absence proxy (SM-04, RM-01, EM-01) for those without a manager.
 * No match of any kind leads on to the registrations (CS-09).
 */
export function KeywordResults({
  keyword,
  listings,
  regions,
  occasions,
}: {
  keyword: string;
  listings: MatchPage<ListingMatchItem>;
  regions: MatchPage<RegionMatchItem>;
  occasions: MatchPage<OccasionMatchItem>;
}) {
  const listingList = useKeywordPage(
    keyword,
    listings,
    listingKey,
    searchListingsFn,
  );
  const regionList = useKeywordPage(
    keyword,
    regions,
    regionKey,
    searchRegionsFn,
  );
  const occasionList = useKeywordPage(
    keyword,
    occasions,
    occasionKey,
    searchOccasionsFn,
  );
  const total = listingList.count + regionList.count + occasionList.count;

  if (total === 0) {
    return (
      <>
        <section className="m-section" aria-labelledby="om02-empty">
          <hr className="m-divider" />
          <EmptyPanel
            titleId="om02-empty"
            title={`「${keyword}」に合う掲載・地域・イベントはありません`}
          >
            閲覧者に表示されていないものを含めて探しました。キーワードを変えて探し直すか、地域・イベントを登録します。
          </EmptyPanel>
        </section>
        <RegisterEntries divided={false} />
      </>
    );
  }
  return (
    <section className="m-section" aria-labelledby="om02-keyword-results">
      <hr className="m-divider" />
      <div className="om-count">
        <SectionTitle variant="manage" id="om02-keyword-results">
          {`「${keyword}」の結果`}
        </SectionTitle>
        <Badge>{`${total}件`}</Badge>
      </div>
      <nav className="m-tabs" aria-label="結果の種類">
        <a className="m-tab" href="#om02-kw-listing">
          掲載<span>{listingList.count}</span>
        </a>
        <a className="m-tab" href="#om02-kw-region">
          地域<span>{regionList.count}</span>
        </a>
        <a className="m-tab" href="#om02-kw-event">
          イベント<span>{occasionList.count}</span>
        </a>
      </nav>

      <h3 className="om02-sub" id="om02-kw-listing">
        掲載
      </h3>
      {listingList.items.length === 0 ? (
        <NoneOfKind label="掲載" />
      ) : (
        <>
          <ListingTable list={listingList} />
          <KindFooter {...listingList} />
        </>
      )}

      <h3 className="om02-sub" id="om02-kw-region">
        地域
      </h3>
      {regionList.items.length === 0 ? (
        <NoneOfKind label="地域" />
      ) : (
        <>
          <table
            className="om-table"
            aria-labelledby="om02-kw-region"
            aria-busy={regionList.loading}
          >
            <thead>
              <tr>
                <th scope="col">地域</th>
                <th scope="col">状態</th>
                <th scope="col">管理者</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {regionList.items.map((region) => (
                <tr key={region.regionId}>
                  <th scope="row">
                    <span className="om-table__title">
                      {region.name ?? "名称未設定の地域"}
                    </span>
                    <span className="om-table__sub">
                      {region.address ?? "所在地は未設定"}
                    </span>
                  </th>
                  <StateCell
                    publication={region.publication}
                    suspended={region.suspended}
                    holding={null}
                  />
                  <OperatorCell
                    hasSteward={region.hasSteward}
                    roleLabel="地域運営者"
                  />
                  <td className="om-table__ops">
                    <div className="om-table__opsbox">
                      <ChipLink
                        to="/ops/subjects/$kind/$id"
                        params={{ kind: "region", id: region.regionId }}
                      >
                        対象の運営
                      </ChipLink>
                      {region.hasSteward ? null : (
                        <ChipLink
                          to="/manage/regions/$regionId"
                          params={{ regionId: region.regionId }}
                          onClick={() =>
                            rememberProxyVisit(regionProxyKey(region.regionId))
                          }
                        >
                          地域を代行
                        </ChipLink>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <KindFooter {...regionList} />
        </>
      )}

      <h3 className="om02-sub" id="om02-kw-event">
        イベント
      </h3>
      {occasionList.items.length === 0 ? (
        <NoneOfKind label="イベント" />
      ) : (
        <>
          <table
            className="om-table"
            aria-labelledby="om02-kw-event"
            aria-busy={occasionList.loading}
          >
            <thead>
              <tr>
                <th scope="col">イベント</th>
                <th scope="col">状態</th>
                <th scope="col">管理者</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {occasionList.items.map((occasion) => (
                <tr key={occasion.occasionId}>
                  <th scope="row">
                    <span className="om-table__title">
                      {occasion.name ?? "名称未設定のイベント"}
                    </span>
                  </th>
                  <StateCell
                    publication={occasion.publication}
                    suspended={occasion.suspended}
                    holding={
                      occasion.holdingStatus === null
                        ? null
                        : HOLDING_STATUS_LABEL[occasion.holdingStatus]
                    }
                  />
                  <OperatorCell
                    hasSteward={occasion.hasSteward}
                    roleLabel="イベント運営者"
                  />
                  <td className="om-table__ops">
                    <div className="om-table__opsbox">
                      <ChipLink
                        to="/ops/subjects/$kind/$id"
                        params={{ kind: "occasion", id: occasion.occasionId }}
                      >
                        対象の運営
                      </ChipLink>
                      {occasion.hasSteward ? null : (
                        <ChipLink
                          to="/manage/events/$occasionId"
                          params={{ occasionId: occasion.occasionId }}
                          onClick={() =>
                            rememberProxyVisit(occasion.occasionId)
                          }
                        >
                          イベントを代行
                        </ChipLink>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <KindFooter {...occasionList} />
        </>
      )}
      {listingList.hasMore ||
      regionList.hasMore ||
      occasionList.hasMore ? null : (
        <p className="om02-end">結果は以上です</p>
      )}
    </section>
  );
}

/** The listing rows of OM-02's keyword results. */
function ListingTable({
  list,
}: {
  list: Readonly<{ items: readonly ListingMatchItem[]; loading: boolean }>;
}) {
  return (
    <table
      className="om-table"
      aria-labelledby="om02-kw-listing"
      aria-busy={list.loading}
    >
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
                    onClick={() => rememberProxyVisit(listing.placeId)}
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
