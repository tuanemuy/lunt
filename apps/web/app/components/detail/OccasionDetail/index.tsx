import { Link } from "@tanstack/react-router";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusTag, StatusTags } from "@/components/ui/StatusTag";
import { TextLink } from "@/components/ui/TextButton";
import { participationApplyHref } from "@/presentation/applyRelationsView";
import {
  HOLDING_STATUS_TEXT,
  type OccasionDetailData,
  type ParticipantItem,
} from "@/presentation/detailView";
import { DetailPhotos } from "../DetailPhotos";
import { PlaceRow, RegionRows } from "../RelatedRows";

/** VW-07 イベントの一覧, to look for other occasions. */
function OtherEventsLink() {
  return <TextLink to="/events">ほかのイベントを探す</TextLink>;
}

/** 終了・中止, told apart from a running occasion. */
function HoldingNotice({ data }: { data: OccasionDetailData }) {
  switch (data.holding) {
    case "upcoming":
    case "ongoing":
      return null;
    case "ended":
      return (
        <Notice
          title="このイベントは終了しました"
          actions={<OtherEventsLink />}
        >
          内容はこのまま見られます。これから開かれるイベントも探せます。
        </Notice>
      );
    case "cancelled":
      return (
        <Notice
          title="このイベントは中止になりました"
          actions={<OtherEventsLink />}
        >
          内容はこのまま見られます。ほかのイベントも探せます。
        </Notice>
      );
  }
}

/**
 * CS-09 (イベントに閲覧できる掲載がない). With participants it sits at the
 * top of their section; without any, the empty section is not shown
 * (`spec/pages/index.md` 「対象が1件もない区分は、区分ごと表示しない」) and
 * the notice stands alone at the place the section would take.
 */
function NoViewableListingNotice({ children }: { children: string }) {
  return (
    <Notice
      title="このイベントで見られる掲載は、まだありません"
      actions={<OtherEventsLink />}
    >
      {children}
    </Notice>
  );
}

/**
 * A participant (参加店舗, reference scene): the place with its days, and
 * the listings it attached with their offering state.
 */
function Participant({ item }: { item: ParticipantItem }) {
  const { place } = item;
  return (
    <div className="dt04-participant">
      <PlaceRow
        item={place}
        {...(item.daysText === null
          ? {}
          : { meta: `参加日　${item.daysText}` })}
      />
      {item.listings.length === 0 ? null : (
        <ul className="dt04-listings" aria-label={`${place.name}が添えた掲載`}>
          {item.listings.map((listing) => (
            <li key={listing.listingId}>
              <Link
                className="text-button"
                to="/listings/$listingId"
                params={{ listingId: listing.listingId }}
              >
                {listing.name}
              </Link>
              {listing.state === null ? null : (
                <span className="dt04-listings__state">{`（${listing.state}）`}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * DT-04 イベント詳細 (`spec/pages/detail.md`): the occasion in the
 * reference scene with its period, venue and holding status (開催予定・
 * 開催中・終了・中止), every participant with its attached listings and
 * days (APX 4 「参加店舗一覧」; days outside the period are not shown), and
 * the linked regions. Without a viewable attached listing the page says so
 * (CS-09). The procedures close it: 参加の申請 (RQ-06,
 * while upcoming or ongoing, for a signed-out viewer or a steward of a
 * place) and the takedown claim (RQ-07). The occasion list (VW-07) is
 * offered below the sections and from the 終了・中止 and CS-09 notices, the
 * participants' map (VW-08) above them. The articles arrive with their
 * stage.
 */
export function OccasionDetail({ data }: { data: OccasionDetailData }) {
  const running = data.holding === "upcoming" || data.holding === "ongoing";
  return (
    <div className="container detail-page">
      <div className="detail detail--split">
        <DetailPhotos photos={data.photos} />
        <div className="detail__main">
          <div className="hero__text">
            <p className="hero__kind">{data.periodText}</p>
            <h1 className="hero__name">{data.name}</h1>
            <p className="hero__place">{data.venue}</p>
            <StatusTags>
              <StatusTag quiet={!running}>
                {HOLDING_STATUS_TEXT[data.holding]}
              </StatusTag>
            </StatusTags>
            {data.tagline === null ? null : (
              <p className="dt04-catch">{data.tagline}</p>
            )}
            {data.description === null ? null : (
              <p className="hero__description">{data.description}</p>
            )}
          </div>

          <HoldingNotice data={data} />

          <ButtonLink
            to="/events/$occasionId/map"
            params={{ occasionId: data.occasionId }}
          >
            参加店舗を地図で見る
          </ButtonLink>

          {data.participants.length === 0 ? (
            data.hasNoViewableListing ? (
              <NoViewableListingNotice>
                参加するお店が決まると、ここに並びます。
              </NoViewableListingNotice>
            ) : null
          ) : (
            <section className="detail-section" aria-labelledby="dt04-shops">
              <SectionTitle id="dt04-shops">
                参加店舗と楽しめること
              </SectionTitle>
              {data.hasNoViewableListing ? (
                <NoViewableListingNotice>
                  参加するお店から、楽しめることを確かめられます。
                </NoViewableListingNotice>
              ) : null}
              <div className="detail-rows">
                {data.participants.map((participant) => (
                  <Participant
                    key={participant.place.placeId}
                    item={participant}
                  />
                ))}
              </div>
            </section>
          )}

          {data.regions.length === 0 ? null : (
            <section className="detail-section" aria-labelledby="dt04-regions">
              <SectionTitle id="dt04-regions">開催する街</SectionTitle>
              <RegionRows items={data.regions} />
            </section>
          )}

          <ButtonLink variant="secondary" to="/events">
            イベントの一覧を見る
          </ButtonLink>

          <div className="procedures">
            <hr className="divider" />
            {data.participationEntry ? (
              <ButtonLink
                variant="secondary"
                to={participationApplyHref({ occasionId: data.occasionId })}
              >
                このイベントへの参加を申請する
              </ButtonLink>
            ) : null}
            <div className="procedures__links">
              <TextLink
                quiet
                to="/takedown/$kind/$id"
                params={{ kind: "occasion", id: data.occasionId }}
              >
                このイベントの取り下げを申し立てる
              </TextLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
