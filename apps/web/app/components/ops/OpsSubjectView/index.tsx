"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageSection,
  ManageStatus,
  ManageTitle,
} from "@/components/layout/ManageShell";
import {
  listingPagePath,
  placeMembersPath,
  placePagePath,
} from "@/components/manage/ShopShell";
import { FramedPhoto } from "@/components/photo/FramedPhoto";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import { TextLink } from "@/components/ui/TextButton";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { transitionListingFn } from "@/presentation/listing";
import {
  listingStateText,
  offeringPhaseLabel,
  publicationLabel,
} from "@/presentation/listingView";
import { invitedOnText } from "@/presentation/members";
import type {
  ListingSubjectData,
  OpsSubjectData,
  PlaceSubjectData,
} from "@/presentation/opsSubject";
import { suspendPlaceFn, unsuspendPlaceFn } from "@/presentation/place";
import { OPERATING_STATUS_LABEL } from "@/presentation/placeView";
import { useReconcile } from "@/presentation/reconcile";
import { OpsSearchReturnLink } from "../OpsSearchReturn";
import { OpsNav } from "../OpsShell";
import { forgetReportProxy } from "../ProxyReturn";

const KIND_LABEL = { place: "店舗", listing: "掲載" } as const;

function Title({ kind, name }: { kind: OpsSubjectData["kind"]; name: string }) {
  return (
    <ManageTitle>
      <OpsSearchReturnLink className="om03-back" />
      <p className="om-kind">{`${KIND_LABEL[kind]} · 対象の運営`}</p>
      <ManageHeading>{name}</ManageHeading>
    </ManageTitle>
  );
}

type Outcome =
  | Readonly<{ kind: "done"; suspended: boolean }>
  | Readonly<{ kind: "failed"; error: ErrorState }>
  | Readonly<{ kind: "missing" }>;

/**
 * Suspension and its lifting, owned by the subject (an in-item change):
 * the flag flips at once and the reconcile brings the stored state.
 * Suspending is confirmed first (CS-12); lifting is not.
 */
function useSuspension(
  suspended: boolean,
  run: (suspend: boolean) => Promise<unknown>,
) {
  const reconcile = useReconcile();
  const [shown, setShown] = useOptimistic(suspended);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const change = (suspend: boolean) => {
    setConfirming(false);
    setOutcome(null);
    startTransition(async () => {
      setShown(suspend);
      try {
        await run(suspend);
        setOutcome({ kind: "done", suspended: suspend });
      } catch (error) {
        const state = classifyError(error);
        setOutcome(
          state.kind === "notFound"
            ? { kind: "missing" }
            : { kind: "failed", error: state },
        );
      }
      await reconcile();
    });
  };
  return { shown, outcome, confirming, setConfirming, pending, change };
}

function FailureAlert({
  error,
  retry,
}: {
  error: ErrorState;
  retry: () => void;
}) {
  return error.kind === "premiseChanged" ? (
    <Alert title="操作を反映できませんでした">
      {`${error.message}。別のサービス運営者が先に操作していました。現在の状態を示しています。`}
    </Alert>
  ) : (
    <Alert
      title="操作できませんでした"
      {...(error.kind === "failed"
        ? {
            actions: (
              <Button variant="secondary" onClick={retry}>
                もう一度操作する
              </Button>
            ),
          }
        : {})}
    >
      {error.kind === "failed"
        ? "通信を確かめて、もう一度操作してください。対象の状態は変わっていません。"
        : error.message}
    </Alert>
  );
}

function Missing({ kind }: { kind: OpsSubjectData["kind"] }) {
  return (
    <EmptyPanel
      title={
        kind === "listing"
          ? "この掲載は削除されています"
          : "店舗が見つかりません"
      }
      actions={<OpsSearchReturnLink variant="button" />}
    >
      運営する対象がありません。非公開と解除の操作は反映していません。
    </EmptyPanel>
  );
}

function PlaceSubject({ data }: { data: PlaceSubjectData }) {
  const suspension = useSuspension(data.suspended, (suspend) =>
    (suspend ? suspendPlaceFn : unsuspendPlaceFn)({
      data: { placeId: data.placeId },
    }),
  );
  const { shown, outcome } = suspension;
  const status = OPERATING_STATUS_LABEL[data.operatingStatus];
  const vacant = data.stewardCount === 0;
  return (
    <ManagePage
      title={<Title kind="place" name={data.name} />}
      nav={<OpsNav />}
    >
      <ManageBody>
        {outcome?.kind === "missing" ? (
          <Missing kind="place" />
        ) : (
          <>
            <div role="status">
              {outcome?.kind === "done" ? (
                <Notice
                  variant="manage"
                  title={
                    outcome.suspended
                      ? `${data.name}を非公開にしました`
                      : `${data.name}の非公開を解除しました`
                  }
                >
                  {outcome.suspended
                    ? "店舗と掲載は、閲覧者に表示されていません。解除すると、再び閲覧できます。"
                    : "店舗は再び閲覧でき、掲載はそれぞれの現在の公開状態に従って表示されます。"}
                </Notice>
              ) : null}
            </div>
            {outcome?.kind === "failed" ? (
              <FailureAlert
                error={outcome.error}
                retry={() => suspension.change(!data.suspended)}
              />
            ) : null}
            <ManageStatus tone={shown ? "alert" : "accent"}>
              {`${status} · ${shown ? "店舗は非公開" : "店舗ページ公開中"}`}
            </ManageStatus>
            {data.cover === null ? (
              <div className="m-photo-empty">写真はありません</div>
            ) : (
              <div className="m-photo">
                <img src={data.cover.url} alt={`${data.name}の代表写真`} />
              </div>
            )}
            <ManageSection id="om03-state" title="公開の状態">
              <dl className="om-facts">
                <div>
                  <dt>営業状況</dt>
                  <dd>{status}</dd>
                </div>
                <div>
                  <dt>店舗の非公開</dt>
                  <dd>
                    {shown ? (
                      <>
                        <Badge tone="alert">店舗の非公開</Badge>{" "}
                        店舗と掲載は閲覧者に表示されません
                      </>
                    ) : (
                      "非公開ではありません。閲覧者は店舗と掲載を閲覧できます。"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>所在地</dt>
                  <dd>{data.address}</dd>
                </div>
                <div>
                  <dt>閲覧者に見えるページ</dt>
                  <dd>
                    {shown ? (
                      "非公開の間は、閲覧者は閲覧できません"
                    ) : (
                      <TextLink to={placePagePath(data.placeId)}>
                        店舗詳細を開く
                      </TextLink>
                    )}
                  </dd>
                </div>
              </dl>
              {shown ? (
                <>
                  <Button
                    className="om03-act"
                    disabled={suspension.pending}
                    onClick={() => suspension.change(false)}
                  >
                    店舗の非公開を解除する
                  </Button>
                  <p className="m-field__help">
                    解除すると、店舗は再び閲覧でき、掲載はそれぞれの現在の公開状態に従って表示されます。解除は確認なしですぐに反映します。
                  </p>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    className="om03-act"
                    disabled={suspension.pending}
                    onClick={() => suspension.setConfirming(true)}
                  >
                    店舗を非公開にする
                  </Button>
                  <p className="m-field__help">
                    確定の前に、閲覧者への見え方の変化を確かめます。
                  </p>
                </>
              )}
            </ManageSection>
            <hr className="m-divider" />
            <ManageSection id="om03-members" title="管理者">
              <dl className="om-facts">
                <div>
                  <dt>店舗管理者</dt>
                  <dd>
                    {vacant ? (
                      <Badge tone="alert">管理者なし</Badge>
                    ) : (
                      `${data.stewardCount}人`
                    )}
                  </dd>
                </div>
                <div>
                  <dt>承諾前の招待</dt>
                  <dd>
                    {data.invitations.length === 0
                      ? "ありません"
                      : `${data.invitations.length}件: ${data.invitations
                          .map(
                            (invitation) =>
                              `${invitation.email}（${invitedOnText(invitation.invitedAt)}）`,
                          )
                          .join("、")}`}
                  </dd>
                </div>
              </dl>
              {vacant ? (
                <p className="m-field__help">
                  不在の代行は、対象を探すの結果から開きます。承諾前の招待の取り消しは、メンバーの管理で行えます。
                </p>
              ) : (
                <Notice
                  variant="manage"
                  tone="paper"
                  title="管理者がいるため、不在の代行はできません"
                >
                  店舗情報と掲載の変更は、店舗管理者が行います。管理者の権限の解除は、メンバーの管理で行えます。
                </Notice>
              )}
              <LinkList>
                <li>
                  <ListRowLink
                    to={placeMembersPath(data.placeId)}
                    title="メンバーの管理"
                    meta={`店舗管理者 ${data.stewardCount}人 · 承諾前の招待 ${data.invitations.length}件`}
                  />
                </li>
              </LinkList>
            </ManageSection>
            <Notice
              variant="manage"
              tone="paper"
              title="重複する店舗を整理するとき"
            >
              残す店舗を決めて、もう一方の店舗を非公開にします。店舗を統合する操作はありません。必要な掲載は、残す店舗に店舗管理者がいなければ不在の代行で作り直します。
            </Notice>
          </>
        )}
      </ManageBody>
      <ConfirmDialog
        open={suspension.confirming}
        title={`${data.name}を非公開にしますか`}
        confirmLabel="非公開にする"
        pending={suspension.pending}
        onConfirm={() => suspension.change(true)}
        onCancel={() => suspension.setConfirming(false)}
      >
        <p>確定すると、すぐに閲覧者への表示が変わります。</p>
        <ul>
          <li>店舗は、閲覧者が閲覧できなくなります</li>
          <li>店舗の掲載も、閲覧者が閲覧できなくなります</li>
          <li>地域の所属店舗と、イベントの参加店舗にも表示されなくなります</li>
          <li>掲載・所属・参加・保存は、他の店舗に引き継がれません</li>
          <li>店舗管理者は、これまでどおり店舗情報と掲載を更新できます</li>
        </ul>
      </ConfirmDialog>
    </ManagePage>
  );
}

function ListingSubject({ data }: { data: ListingSubjectData }) {
  const suspension = useSuspension(data.suspended, (suspend) =>
    transitionListingFn({
      data: {
        listingId: data.listingId,
        transition: suspend ? "suspend" : "unsuspend",
      },
    }),
  );
  const { shown, outcome } = suspension;
  const name = data.name ?? "名称未設定";
  const pubLabel = publicationLabel(data.publication);
  const viewable =
    !shown && data.publication.status === "published" && !data.place.suspended;
  return (
    <ManagePage title={<Title kind="listing" name={name} />} nav={<OpsNav />}>
      <ManageBody>
        {outcome?.kind === "missing" ? (
          <Missing kind="listing" />
        ) : (
          <>
            <div role="status">
              {outcome?.kind === "done" ? (
                <Notice
                  variant="manage"
                  title={
                    outcome.suspended
                      ? `${name}を非公開にしました`
                      : "運営による非公開を解除しました"
                  }
                >
                  {outcome.suspended
                    ? "掲載は、閲覧者が閲覧できません。管理者は情報を更新できますが、公開状態は変えられません。"
                    : `${name}は、非公開の前の公開状態「${pubLabel}」に戻りました。`}
                </Notice>
              ) : null}
            </div>
            {outcome?.kind === "failed" ? (
              <FailureAlert
                error={outcome.error}
                retry={() => suspension.change(!data.suspended)}
              />
            ) : null}
            <ManageStatus tone={shown ? "alert" : "accent"}>
              {listingStateText(data.publication, shown, data.offeringStatus)}
            </ManageStatus>
            <FramedPhoto
              url={data.cover?.url ?? null}
              framing={data.cover?.framing ?? null}
              alt={name}
              ratio={348 / 150}
              className="m-photo"
            />
            <ManageSection id="om03-state" title="公開の状態">
              <dl className="om-facts">
                <div>
                  <dt>公開状態</dt>
                  <dd>{pubLabel}</dd>
                </div>
                <div>
                  <dt>提供状態</dt>
                  <dd>{offeringPhaseLabel(data.offeringStatus)}</dd>
                </div>
                <div>
                  <dt>運営による非公開</dt>
                  <dd>
                    {shown ? (
                      <>
                        <Badge tone="alert">運営による非公開</Badge>{" "}
                        {`公開状態「${pubLabel}」に重ねています。解除できるのはサービス運営者だけです`}
                      </>
                    ) : (
                      "非公開ではありません"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>閲覧者に見えるページ</dt>
                  <dd>
                    {viewable ? (
                      <TextLink to={listingPagePath(data.listingId)}>
                        掲載詳細を開く
                      </TextLink>
                    ) : (
                      "閲覧者は閲覧できません"
                    )}
                  </dd>
                </div>
              </dl>
              {shown ? (
                <>
                  <Button
                    className="om03-act"
                    disabled={suspension.pending}
                    onClick={() => suspension.change(false)}
                  >
                    非公開を解除する
                  </Button>
                  <p className="m-field__help">
                    {`解除すると、非公開の前の公開状態「${pubLabel}」に戻ります。解除は確認なしですぐに反映します。`}
                  </p>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    className="om03-act"
                    disabled={suspension.pending}
                    onClick={() => suspension.setConfirming(true)}
                  >
                    掲載を非公開にする
                  </Button>
                  <p className="m-field__help">
                    確定の前に、閲覧者への見え方の変化を確かめます。
                  </p>
                </>
              )}
            </ManageSection>
            <hr className="m-divider" />
            <ManageSection id="om03-place" title="紐づく店舗">
              <LinkList>
                <li>
                  <ListRowLink
                    to="/ops/subjects/$kind/$id"
                    params={{ kind: "place", id: data.place.id }}
                    title={data.place.name}
                    meta={[
                      data.place.suspended ? "店舗は非公開" : "公開中",
                      data.place.hasSteward
                        ? "店舗管理者あり"
                        : "店舗管理者なし",
                    ].join(" · ")}
                  />
                </li>
              </LinkList>
              <p className="m-field__help">
                {data.place.hasSteward
                  ? "掲載の管理者は、店舗の店舗管理者です。管理者がいるため、不在の代行はできません。"
                  : "掲載の管理者は、店舗の店舗管理者です。この店舗には店舗管理者がいません。掲載の不在の代行は、対象を探すの結果から開きます。"}
              </p>
            </ManageSection>
          </>
        )}
      </ManageBody>
      <ConfirmDialog
        open={suspension.confirming}
        title={`${name}を非公開にしますか`}
        confirmLabel="非公開にする"
        pending={suspension.pending}
        onConfirm={() => suspension.change(true)}
        onCancel={() => suspension.setConfirming(false)}
      >
        <p>確定すると、すぐに閲覧者への表示が変わります。</p>
        <ul>
          <li>掲載は、閲覧者が閲覧できなくなります</li>
          <li>管理者は情報を更新できますが、公開状態は変えられなくなります</li>
          <li>解除できるのは、サービス運営者だけです</li>
        </ul>
      </ConfirmDialog>
    </ManagePage>
  );
}

/**
 * OM-03 対象の運営 of a store or a listing (MOD-07, MOD-08, MOD-09): its
 * state and stewards, suspension and its lifting, and the way to CM-02.
 * OM-03 has no absence-proxy entry; OM-02 has them.
 */
export function OpsSubjectView({ data }: { data: OpsSubjectData }) {
  // CM-02 opened from here leads back here, not to a report.
  useEffect(forgetReportProxy, []);
  return data.kind === "place" ? (
    <PlaceSubject data={data} />
  ) : (
    <ListingSubject data={data} />
  );
}

/** OM-03 when the subject could not be read (CS-17, CS-02). */
export function OpsSubjectProblem({
  kind,
  missing,
}: {
  kind: OpsSubjectData["kind"];
  missing: boolean;
}) {
  return (
    <ManagePage
      title={<Title kind={kind} name="対象の運営" />}
      nav={<OpsNav />}
    >
      <ManageBody>
        {missing ? (
          <Missing kind={kind} />
        ) : (
          <EmptyPanel
            title="読み込めませんでした"
            actions={<OpsSearchReturnLink variant="button" />}
          >
            通信を確かめて、もう一度開いてください。
          </EmptyPanel>
        )}
      </ManageBody>
    </ManagePage>
  );
}
