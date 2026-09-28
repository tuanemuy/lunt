"use client";

import {
  ManageBody,
  ManageSection,
  ManageStatus,
} from "@/components/layout/ManageShell";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { CountTab, CountTabs } from "@/components/ui/CountTabs";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import { TextLink } from "@/components/ui/TextButton";
import {
  LISTING_SHELF_LABEL,
  LISTING_SHELVES,
} from "@/presentation/listingView";
import { dayText } from "@/presentation/moderation";
import {
  OPERATING_STATUS_LABEL,
  type ShopHomeData,
} from "@/presentation/placeView";
import { placeMembersPath, placePagePath, ShopPage } from "../ShopShell";
import { usePlaceFrame } from "../ShopShell/usePlaceFrame";

/**
 * 対応が必要なこと: the store's returned applications (MY-05) and its open
 * confirmation requests (SM-07), each kind with its count.
 */
function ShopTodoList({
  placeId,
  todo,
}: {
  placeId: string;
  todo: ShopHomeData["todo"];
}) {
  if (todo.returned.length === 0 && todo.requests.count === 0) {
    return (
      <Notice
        variant="manage"
        tone="paper"
        title="対応が必要なことはありません"
      >
        差し戻しの申請も、確認依頼中の確認の依頼もありません。
      </Notice>
    );
  }
  return (
    <div className="sm01-todo">
      {todo.returned.length === 0 ? null : (
        <Notice
          variant="manage"
          title={
            <>
              差し戻しの申請{" "}
              <Badge tone="count">{`${todo.returned.length}件`}</Badge>
            </>
          }
          actions={
            <LinkList>
              {todo.returned.map((item) => (
                <li key={item.applicationId}>
                  <ListRowLink
                    to="/me/applications/$applicationId"
                    params={{ applicationId: item.applicationId }}
                    title={item.title}
                    meta="差し戻し · 追加の確認に答えて再提出します"
                  />
                </li>
              ))}
            </LinkList>
          }
        />
      )}
      {todo.requests.count === 0 ? null : (
        <Notice
          variant="manage"
          title={
            <>
              確認の依頼{" "}
              <Badge tone="count">{`${todo.requests.count}件`}</Badge>
            </>
          }
          actions={
            <LinkList>
              {todo.requests.items.map((item) => (
                <li key={item.reportId}>
                  <ListRowLink
                    to="/manage/places/$placeId/checks/$reportId"
                    params={{ placeId, reportId: item.reportId }}
                    title={item.title}
                    meta={`確認依頼中 · ${dayText(item.requestedAt)}`}
                  />
                </li>
              ))}
            </LinkList>
          }
        />
      )}
    </div>
  );
}

/**
 * SM-01 店舗ホーム: the store's state, what needs doing (returned
 * applications, confirmation requests), its listings per 区分, and the
 * ways into the other SM screens.
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
          <ShopTodoList placeId={frame.placeId} todo={data.todo} />
          <TextLink to="/me/applications" search={{ place: frame.placeId }}>
            この店舗の申請をすべて見る
          </TextLink>
        </ManageSection>

        <ManageSection id="sm01-listings" title="掲載">
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
          {data.listingCounts.all === 0 ? (
            <Notice variant="manage" tone="paper" title="掲載はまだありません">
              「＋ 掲載を追加」から始められます。
            </Notice>
          ) : null}
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
