"use client";

import {
  ManageBody,
  ManageSection,
  ManageStatus,
} from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import {
  CATEGORY_LABEL,
  type ConfirmationRequestData,
  dayText,
} from "@/presentation/moderation";
import { ShopPage } from "../ShopShell";
import { usePlaceFrame } from "../ShopShell/usePlaceFrame";

/**
 * SM-07 確認の依頼 (MOD-06): what was reported about the store or one of
 * its listings, whether the operators still await it, and the ways to
 * the screens that fix it (SM-02, SM-03, SM-04). Read-only: stewards do
 * not answer or close a request; the operators judge from the store's
 * current content (OM-05).
 */
export function ConfirmationRequestView({
  data,
}: {
  data: ConfirmationRequestData;
}) {
  const frame = usePlaceFrame();
  const params = { placeId: frame.placeId };
  const { target } = data;
  const resolved = data.status === "resolved";
  const listingGone = target.kind === "listing" && !target.exists;
  const listingName =
    target.listingName ??
    (target.exists ? "名称未設定の掲載" : "削除された掲載");
  const targetText =
    target.kind === "place"
      ? `${target.placeName ?? frame.name}（店舗）`
      : target.exists || target.listingName !== null
        ? `${listingName}（掲載${target.exists ? "" : "・削除済み"}）`
        : listingName;
  return (
    <ShopPage frame={frame} heading="確認の依頼">
      <ManageBody>
        {resolved ? (
          <ManageStatus tone="neutral">
            対応済み · サービス運営者が対応を終えました
          </ManageStatus>
        ) : (
          <ManageStatus>{`確認依頼中 · ${dayText(data.requestedAt)}に届きました`}</ManageStatus>
        )}
        {listingGone ? (
          <Alert title="連絡の対象の掲載は削除されています">
            {`${target.listingName ?? "この掲載"}は削除されているため、開けません。店舗の情報と、残る掲載に同じ誤りがないかを確かめられます。`}
          </Alert>
        ) : null}
        {resolved ? (
          <Notice variant="manage" tone="paper" title="この連絡は対応済みです">
            サービス運営者が、店舗の現在の内容を見て対応を終えました。依頼の内容は読めます。店舗の情報と掲載は、これからも更新できます。
          </Notice>
        ) : null}

        <ManageSection id="sm07-request" title="連絡の内容">
          <dl className="p-dl">
            <div className="p-dl__row">
              <dt>対象</dt>
              <dd>{targetText}</dd>
            </div>
            <div className="p-dl__row">
              <dt>連絡の種類</dt>
              <dd>{CATEGORY_LABEL[data.category]}</dd>
            </div>
            <div className="p-dl__row">
              <dt>連絡の内容</dt>
              <dd className="p-quote">{data.content}</dd>
            </div>
            <div className="p-dl__row">
              <dt>依頼の日</dt>
              <dd>{dayText(data.requestedAt)}</dd>
            </div>
          </dl>
        </ManageSection>

        {resolved ? null : (
          <Notice variant="manage" title="確かめて、誤りがあれば直してください">
            {`直した内容は、保存した時点で閲覧者への表示に反映します。誤りがなければ、何も変える必要はありません。確認の結果を運営に伝える操作はありません。この依頼は、${frame.name}のすべての店舗管理者に届いています。1人が対応すれば足ります。`}
          </Notice>
        )}

        <ManageSection id="sm07-fix" title="確かめて直す">
          <LinkList>
            {target.kind === "listing" &&
            target.exists &&
            target.listingId !== null ? (
              <li>
                <ListRowLink
                  to="/manage/places/$placeId/listings/$listingId"
                  params={{ ...params, listingId: target.listingId }}
                  title={`${listingName}を編集`}
                  meta="掲載の内容・提供期間・公開の状態"
                />
              </li>
            ) : null}
            <li>
              <ListRowLink
                to="/manage/places/$placeId/info"
                params={params}
                title="店舗情報と営業状況"
                meta="名称・写真・所在地・営業時間・連絡先・営業状況"
              />
            </li>
            <li>
              <ListRowLink
                to="/manage/places/$placeId/listings"
                params={params}
                title="掲載の一覧"
                meta="店舗の掲載の全体"
              />
            </li>
          </LinkList>
        </ManageSection>
      </ManageBody>
    </ShopPage>
  );
}
