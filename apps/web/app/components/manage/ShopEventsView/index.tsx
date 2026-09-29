"use client";

import { ManageBody, ManageSection } from "@/components/layout/ManageShell";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { ChipLink } from "@/components/ui/ChipButton";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Row, RowLink } from "@/components/ui/Rows";
import { participationApplyHref } from "@/presentation/applyRelationsView";
import {
  type AttachedListingLine,
  CONTENT_PUBLICATION_LABEL,
  HOLDING_STATUS_LABEL,
  hiddenReason,
  type ShopEventItem,
  type ShopEventsData,
} from "@/presentation/shopRelations";
import { PendingApplications } from "../PendingApplications";
import { ShopPage } from "../ShopShell";
import { usePlaceFrame } from "../ShopShell/usePlaceFrame";

const HEADING = "イベントの状況";

/**
 * CM-04 on the store's side (another area): a plain path, typed once the
 * route exists.
 */
const participationPath = (placeId: string, occasionId: string): string =>
  `/manage/places/${encodeURIComponent(placeId)}/events/${encodeURIComponent(occasionId)}`;

function listingText(listing: AttachedListingLine): string {
  if (listing.deleted) return "削除された掲載";
  const name = listing.name ?? "名称未設定の掲載";
  return listing.viewable
    ? `${name} · ${listing.stateText}`
    : `${name} · ${listing.stateText} · 閲覧者には表示されていません`;
}

function EventBadges({ item }: { item: ShopEventItem }) {
  return (
    <span className="p-badges">
      {item.holding === null ? null : (
        <Badge
          tone={
            item.holding === "upcoming" || item.holding === "ongoing"
              ? "accent"
              : "muted"
          }
        >
          {HOLDING_STATUS_LABEL[item.holding]}
        </Badge>
      )}
      {item.suspended ? <Badge tone="alert">運営による非公開</Badge> : null}
      <Badge tone={item.publication === "unpublished" ? "muted" : "neutral"}>
        {CONTENT_PUBLICATION_LABEL[item.publication]}
      </Badge>
    </span>
  );
}

function EventItem({ item }: { item: ShopEventItem }) {
  const frame = usePlaceFrame();
  const hidden = hiddenReason(item.publication, item.suspended);
  const row = {
    photo: item.photoUrl === null ? null : { src: item.photoUrl, alt: "" },
    name: item.name ?? "名称未設定のイベント",
    ...(item.periodText === null ? {} : { meta: item.periodText }),
    sub: <EventBadges item={item} />,
  };
  return (
    <li className="p-item">
      {hidden === null ? (
        <RowLink
          to="/events/$occasionId"
          params={{ occasionId: item.occasionId }}
          {...row}
        />
      ) : (
        <Row {...row} />
      )}
      <div className="sm06-sub">
        {hidden === null ? null : (
          <p className="p-item__text">{`イベントは${hidden}、閲覧者には表示されていません。`}</p>
        )}
        <p className="sm06-sub__label">添えた掲載</p>
        {item.listings.length === 0 ? (
          <p className="p-item__text">添えた掲載はありません</p>
        ) : (
          item.listings.map((listing) => (
            <p key={listing.listingId} className="p-item__text">
              {listingText(listing)}
            </p>
          ))
        )}
        <p className="sm06-sub__label">参加日</p>
        {item.days.length === 0 && item.outOfPeriodDays.length === 0 ? (
          <p className="p-item__text">参加日の指定はありません</p>
        ) : null}
        {item.days.length === 0 ? null : (
          <p className="p-item__text">{item.days.join("・")}</p>
        )}
        {item.outOfPeriodDays.map((day) => (
          <p key={day} className="p-item__text" data-tone="alert">
            {`${day} · 開催期間の外`}
          </p>
        ))}
      </div>
      <div className="p-item__ops">
        <ChipLink to={participationPath(frame.placeId, item.occasionId)}>
          参加内容の変更・取りやめ
        </ChipLink>
      </div>
    </li>
  );
}

/**
 * SM-06 イベントの状況 (`spec/pages/shop.md`): the occasions the store
 * takes part in, newest first — with each one's period, holding status
 * and publication (unpublished, suspended, ended and cancelled ones
 * included, hidden ones said to be hidden), its attached listings with
 * their states (deleted ones as deleted) and its days (those the period
 * now leaves out marked). Each leads to CM-04 to change or withdraw the
 * participation. The entry to RQ-06 (参加の申請), and the store's
 * participation applications in progress, each leading to its MY-05.
 */
export function ShopEventsView({ data }: { data: ShopEventsData }) {
  const frame = usePlaceFrame();
  const applyHref = participationApplyHref({ placeId: frame.placeId });
  const empty = data.items.length === 0 && data.pending.length === 0;
  return (
    <ShopPage
      frame={frame}
      heading={HEADING}
      {...(empty
        ? {}
        : {
            actions: (
              <ButtonLink to={applyHref}>イベントへの参加を申請</ButtonLink>
            ),
          })}
    >
      <ManageBody>
        {empty ? (
          <EmptyPanel
            title="参加中・申請中のイベントはありません"
            actions={
              <ButtonLink variant="secondary" to={applyHref}>
                イベントへの参加を申請
              </ButtonLink>
            }
          >
            イベントに参加すると、イベントのページに店舗と添えた掲載が並びます。参加するイベントは、参加の申請で選べます。
          </EmptyPanel>
        ) : (
          <>
            {data.items.length === 0 ? null : (
              <ManageSection id="sm06-joined" title="参加中のイベント">
                <ul className="p-items">
                  {data.items.map((item) => (
                    <EventItem key={item.occasionId} item={item} />
                  ))}
                </ul>
              </ManageSection>
            )}
            <PendingApplications
              id="sm06-apply"
              title="申請中のイベント"
              empty="申請中のイベントはありません。"
              help="申請中の参加をやめるときは、申請の詳細で取り下げます。"
              items={data.pending}
              placeId={frame.placeId}
            />
            <p className="p-end">すべてのイベントを表示しました</p>
          </>
        )}
      </ManageBody>
    </ShopPage>
  );
}
