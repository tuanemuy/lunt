"use client";

import {
  ManageBody,
  ManageSection,
  ManageStatus,
} from "@/components/layout/ManageShell";
import { ButtonLink } from "@/components/ui/Button";
import { CountTab, CountTabs } from "@/components/ui/CountTabs";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import {
  LISTING_SHELF_LABEL,
  LISTING_SHELVES,
} from "@/presentation/listingView";
import {
  OPERATING_STATUS_LABEL,
  type ShopHomeData,
} from "@/presentation/placeView";
import { placeMembersPath, placePagePath, ShopPage } from "../ShopShell";
import { usePlaceFrame } from "../ShopShell/usePlaceFrame";

/**
 * SM-01 店舗ホーム: the store's state, its listings per 区分, and the ways
 * into the other SM screens. Applications and check requests (対応が必要な
 * こと) arrive with their stage; until then there are none to show.
 */
export function ShopHomeView({ data }: { data: ShopHomeData }) {
  const frame = usePlaceFrame();
  const params = { placeId: frame.placeId };
  const status = OPERATING_STATUS_LABEL[data.operatingStatus];
  return (
    <ShopPage frame={frame}>
      <ManageBody>
        {data.suspended ? (
          <ManageStatus tone="neutral">{`${status} · 店舗は非公開`}</ManageStatus>
        ) : (
          <ManageStatus>{`${status} · 店舗ページ公開中`}</ManageStatus>
        )}
        {data.suspended ? (
          <div role="status">
            <Notice variant="manage" tone="paper" title="この店舗は非公開です">
              サービス運営者が店舗を非公開にしています。解除されるまで、店舗と掲載は閲覧者に表示されません。非公開は、店舗管理者からは解除できません。掲載の編集などの操作は、これまでどおり行えます。
            </Notice>
          </div>
        ) : null}
        {data.photosTakenDown ? (
          <div role="status">
            <Notice
              variant="manage"
              tone="paper"
              title="申立てにより、店舗の写真が削除されました"
              actions={
                <ButtonLink
                  variant="secondary"
                  to="/manage/places/$placeId/info"
                  params={params}
                  hash="photos"
                >
                  写真を登録する
                </ButtonLink>
              }
            >
              店舗は公開を続けています。写真を登録して保存すると、この表示は消えます。
            </Notice>
          </div>
        ) : null}
        {data.cover === null ? (
          <div className="m-photo-empty">写真はまだありません</div>
        ) : (
          <div className="m-photo">
            <img src={data.cover.url} alt={`${data.name}の代表写真`} />
          </div>
        )}
        <div className="sm01-buttons">
          <ButtonLink to="/manage/places/$placeId/listings/new" params={params}>
            ＋ 掲載を追加
          </ButtonLink>
          <ButtonLink variant="secondary" to={placePagePath(frame.placeId)}>
            公開ページを確認
          </ButtonLink>
        </div>

        <ManageSection id="sm01-todo" title="対応が必要なこと">
          <Notice
            variant="manage"
            tone="paper"
            title="対応が必要なことはありません"
          >
            差し戻しの申請も、確認依頼中の確認の依頼もありません。
          </Notice>
        </ManageSection>

        <ManageSection id="sm01-listings" title="掲載">
          {data.listingCounts.all === 0 ? (
            <Notice variant="manage" tone="paper" title="掲載はまだありません">
              商品や体験を掲載すると、ここに区分ごとの件数が並びます。「＋
              掲載を追加」から始められます。
            </Notice>
          ) : (
            <CountTabs label="掲載の区分">
              {LISTING_SHELVES.map((shelf) => (
                <CountTab
                  key={shelf}
                  to="/manage/places/$placeId/listings"
                  params={params}
                  search={{ status: shelf }}
                  count={data.listingCounts[shelf]}
                  activeOptions={{ exact: true, includeSearch: true }}
                >
                  {LISTING_SHELF_LABEL[shelf]}
                </CountTab>
              ))}
            </CountTabs>
          )}
        </ManageSection>

        <ManageSection id="sm01-manage" title="店舗の管理">
          <LinkList>
            <li>
              <ListRowLink
                to="/manage/places/$placeId/info"
                params={params}
                title="店舗情報と営業状況"
                meta={`${status} · 名称・写真・所在地・営業時間・連絡先`}
              />
            </li>
            <li>
              <ListRowLink
                to={placeMembersPath(frame.placeId)}
                title="メンバーの管理"
                meta={`店舗管理者 ${data.stewardCount}人`}
              />
            </li>
          </LinkList>
        </ManageSection>
      </ManageBody>
    </ShopPage>
  );
}
