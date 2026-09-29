"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageSection,
  ManageStatus,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { placeMembersPath } from "@/components/manage/ShopShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChipLink } from "@/components/ui/ChipButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TextLink } from "@/components/ui/TextButton";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import {
  CATEGORY_LABEL,
  dayText,
  detailPath,
  type InfoReportData,
  type InfoReportStatusValue,
  REPORT_STATUS_LABEL,
  requestInfoReportConfirmationFn,
  resolveInfoReportFn,
} from "@/presentation/moderation";
import { useReconcile } from "@/presentation/reconcile";
import { OpsNav } from "../OpsShell";
import { rememberProxyVisit, rememberReportProxy } from "../ProxyReturn";

const CODE_NOT_OPEN = "MODERATION_INFO_REPORT_NOT_OPEN";
const CODE_ALREADY_RESOLVED = "MODERATION_INFO_REPORT_ALREADY_RESOLVED";
const CODE_NO_STEWARD = "MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD";

function Title() {
  return (
    <ManageTitle>
      <TextLink to="/ops" className="om05-back">
        対応が必要なものへ戻る
      </TextLink>
      <p className="om-kind">情報の誤り・閉店の連絡</p>
      <ManageHeading>連絡の対応</ManageHeading>
    </ManageTitle>
  );
}

type Operation = "request" | "resolve";

type Outcome =
  | Readonly<{ kind: "requested" }>
  | Readonly<{ kind: "resolved" }>
  | Readonly<{ kind: "failed"; operation: Operation; error: ErrorState }>;

const STATUS_BADGE = {
  open: "alert",
  confirmationRequested: "neutral",
  resolved: "accent",
} as const satisfies Readonly<
  Record<InfoReportStatusValue, "alert" | "neutral" | "accent">
>;

/**
 * OM-05 連絡の対応 (MOD-05): the report, the store as it stands now, the
 * request to its stewards (confirmed, CS-12) and closing the report
 * (confirmed, CS-12). The status is an in-item change owned here: it
 * flips at once and the reconcile brings the stored one. Without
 * stewards the report offers the absence proxy of the store, which leads
 * back here.
 */
export function InfoReportView({ data }: { data: InfoReportData }) {
  const reconcile = useReconcile();
  const [status, setStatus] = useOptimistic<InfoReportStatusValue>(data.status);
  const [confirming, setConfirming] = useState<Operation | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, startTransition] = useTransition();

  const { target } = data;
  const placeName = target.placeName ?? "店舗";
  const stewardCount = data.place?.stewardCount ?? 0;
  const vacant = stewardCount === 0;
  const listingGone = target.kind === "listing" && !target.exists;
  const hidden = target.exists && !target.viewable;
  const resolved = status === "resolved";
  const targetLine =
    target.kind === "place"
      ? `店舗 · ${placeName}`
      : `掲載 · ${
          target.listingName ??
          (target.exists ? "名称未設定" : "削除された掲載")
        }${target.exists || target.listingName === null ? "" : "（削除済み）"}（${placeName}）`;
  const conflictCode = outcome?.kind === "failed" ? outcome.error.code : null;

  const run = (operation: Operation) => {
    setConfirming(null);
    setOutcome(null);
    startTransition(async () => {
      setStatus(operation === "request" ? "confirmationRequested" : "resolved");
      try {
        if (operation === "request") {
          await requestInfoReportConfirmationFn({
            data: { reportId: data.reportId },
          });
          setOutcome({ kind: "requested" });
        } else {
          await resolveInfoReportFn({ data: { reportId: data.reportId } });
          setOutcome({ kind: "resolved" });
        }
      } catch (error) {
        setOutcome({ kind: "failed", operation, error: classifyError(error) });
      }
      await reconcile();
    });
  };

  const proxyParams = { placeId: target.placeId };
  const remember = () => rememberReportProxy(target.placeId, data.reportId);
  const rememberProxy = () => {
    remember();
    rememberProxyVisit(target.placeId);
  };

  return (
    <ManagePage
      title={<Title />}
      nav={<OpsNav current="inbox" />}
      actions={
        resolved ? (
          <ButtonLink to="/ops">対応が必要なものへ戻る</ButtonLink>
        ) : (
          <Button onClick={() => setConfirming("resolve")} disabled={pending}>
            対応を終える
          </Button>
        )
      }
      {...(!resolved && vacant && !listingGone
        ? { actionsNote: "不在の代行で更新してから、対応を終えます。" }
        : {})}
    >
      <ManageBody>
        {status === "open" ? (
          <ManageStatus tone="alert">
            {`未対応 · ${dayText(data.receivedAt)}に受付`}
          </ManageStatus>
        ) : status === "confirmationRequested" ? (
          <ManageStatus tone="neutral">
            {`確認依頼中 · ${
              data.requestedAt === null
                ? "依頼済み"
                : `${dayText(data.requestedAt)}に依頼`
            }`}
          </ManageStatus>
        ) : (
          <ManageStatus>対応済み</ManageStatus>
        )}

        {conflictCode === CODE_NOT_OPEN && data.status !== "resolved" ? (
          <Alert title="この連絡は、すでに確認依頼中です">
            別のサービス運営者が先に店舗管理者へ確認を依頼していました。依頼は重ねて送っていません。現在の状態を示しています。
          </Alert>
        ) : null}
        {(conflictCode === CODE_ALREADY_RESOLVED ||
          conflictCode === CODE_NOT_OPEN) &&
        data.status === "resolved" ? (
          <Alert
            title="この連絡は、すでに対応済みです"
            actions={
              <ButtonLink variant="secondary" to="/ops">
                対応が必要なものへ戻る
              </ButtonLink>
            }
          >
            別のサービス運営者が先に対応を終えていました。操作は反映していません。
          </Alert>
        ) : null}
        {conflictCode === CODE_NO_STEWARD ? (
          <Alert title="確認を依頼できませんでした">
            この店舗には、いま店舗管理者がいません。不在の代行で店舗の情報と掲載を更新してから、対応を終えます。
          </Alert>
        ) : null}
        {outcome?.kind === "failed" &&
        conflictCode !== CODE_NOT_OPEN &&
        conflictCode !== CODE_ALREADY_RESOLVED &&
        conflictCode !== CODE_NO_STEWARD ? (
          <Alert
            title={
              outcome.operation === "request"
                ? "確認を依頼できませんでした"
                : "対応を終えられませんでした"
            }
            {...(outcome.error.kind === "failed"
              ? {
                  actions: (
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => run(outcome.operation)}
                    >
                      {outcome.operation === "request"
                        ? "もう一度依頼"
                        : "もう一度対応を終える"}
                    </Button>
                  ),
                }
              : {})}
          >
            {outcome.error.kind === "failed"
              ? "通信を確かめて、もう一度操作してください。連絡の状態は変わっていません。"
              : outcome.error.message}
          </Alert>
        ) : null}
        <div role="status">
          {outcome?.kind === "requested" ? (
            <Notice variant="manage" title="店舗管理者に確認を依頼しました">
              {`${placeName}の店舗管理者 ${stewardCount}人に、連絡の内容を添えた依頼が届きました。連絡は確認依頼中になりました。`}
            </Notice>
          ) : null}
          {outcome?.kind === "resolved" ? (
            <Notice variant="manage" title="対応を終えました">
              連絡は対応済みになりました。連絡した利用者には、結果は届きません。
            </Notice>
          ) : null}
        </div>

        <ManageSection id="om05-report" title="連絡の内容">
          <dl className="om-facts">
            <div>
              <dt>状態</dt>
              <dd>
                <Badge tone={STATUS_BADGE[status]}>
                  {REPORT_STATUS_LABEL[status]}
                </Badge>
              </dd>
            </div>
            <div>
              <dt>連絡の種類</dt>
              <dd>{CATEGORY_LABEL[data.category]}</dd>
            </div>
            <div>
              <dt>対象</dt>
              <dd>{targetLine}</dd>
            </div>
            <div>
              <dt>内容</dt>
              <dd className="om05-body">{data.content}</dd>
            </div>
            <div>
              <dt>連絡した利用者</dt>
              <dd>{data.reporterEmail ?? "退会した利用者"}</dd>
            </div>
          </dl>
        </ManageSection>

        <hr className="m-divider" />

        <ManageSection id="om05-target" title="対象の現在の状態">
          {listingGone ? (
            <Notice
              variant="manage"
              tone="paper"
              title="対象の掲載は、すでに削除されています"
            >
              確認の依頼はできません。対応を終える操作は行えます。
            </Notice>
          ) : null}
          {hidden ? (
            <Notice
              variant="manage"
              tone="paper"
              title={`この${target.kind === "place" ? "店舗" : "掲載"}は、すでに非公開です`}
            >
              閲覧者には表示されていません。非公開の状態は、対象の運営で確かめます。確認の依頼と、対応を終える操作は行えます。
            </Notice>
          ) : null}
          {data.place === null || listingGone ? null : (
            <dl className="om-facts">
              <div>
                <dt>公開の状態</dt>
                <dd>
                  {data.place.suspended ? (
                    <>
                      {`${data.place.stateText.split(" · ")[0] ?? ""} · `}
                      <Badge tone="alert">店舗は非公開</Badge>
                    </>
                  ) : (
                    data.place.stateText
                  )}
                  {target.kind === "listing"
                    ? target.viewable
                      ? "（掲載は閲覧できる）"
                      : "（掲載は閲覧者に表示されていません）"
                    : ""}
                </dd>
              </div>
              <div>
                <dt>店舗管理者</dt>
                <dd>
                  {vacant ? (
                    <Badge tone="alert">管理者なし</Badge>
                  ) : (
                    `${stewardCount}人`
                  )}
                </dd>
              </div>
            </dl>
          )}
          {listingGone ? null : (
            <p className="m-field__help">
              店舗と掲載の現在の内容は、閲覧者に見える詳細で確かめます。店舗管理者からの返答はありません。内容を見て、対応したか、誤りが残っていないかを判断します。
            </p>
          )}
          <LinkList>
            {target.kind === "listing" &&
            target.exists &&
            target.viewable &&
            target.listingId !== null ? (
              <li>
                <ListRowLink
                  to={detailPath("listing", target.listingId)}
                  title="掲載の現在の内容"
                  meta={`閲覧者に見える掲載詳細 · ${target.listingName ?? ""}`}
                />
              </li>
            ) : null}
            {data.place !== null && !data.place.suspended ? (
              <li>
                <ListRowLink
                  to={detailPath("place", target.placeId)}
                  title="店舗の現在の内容"
                  meta={`閲覧者に見える店舗詳細 · ${placeName}`}
                />
              </li>
            ) : null}
            {listingGone ? null : (
              <li>
                <ListRowLink
                  to="/ops/subjects/$kind/$id"
                  params={
                    target.kind === "listing" && target.listingId !== null
                      ? { kind: "listing", id: target.listingId }
                      : { kind: "place", id: target.placeId }
                  }
                  title="対象の運営"
                  meta="公開の状態と管理者の有無、非公開とその解除"
                />
              </li>
            )}
            {status === "confirmationRequested" && !vacant ? (
              <li>
                <ListRowLink
                  to={placeMembersPath(target.placeId)}
                  onClick={remember}
                  title="メンバーの管理"
                  meta="店舗管理者が対応しないと判断したときは、権限を解除します"
                />
              </li>
            ) : null}
          </LinkList>
        </ManageSection>

        {!resolved && vacant ? (
          <section className="m-section" aria-labelledby="om05-proxy">
            <hr className="m-divider" />
            <SectionTitle variant="manage" id="om05-proxy">
              不在の代行で更新する
            </SectionTitle>
            <p className="om05-text">
              店舗管理者がいないため、確認の依頼はできません。不在の代行で店舗の情報と掲載を更新し、この画面に戻って対応を終えます。
            </p>
            <div className="om05-proxy">
              <ChipLink
                to="/manage/places/$placeId/info"
                params={proxyParams}
                onClick={rememberProxy}
              >
                店舗情報を代行
              </ChipLink>
              {target.kind === "listing" &&
              target.exists &&
              target.listingId !== null ? (
                <ChipLink
                  to="/manage/places/$placeId/listings/$listingId"
                  params={{ ...proxyParams, listingId: target.listingId }}
                  onClick={rememberProxy}
                >
                  掲載を代行
                </ChipLink>
              ) : (
                <ChipLink
                  to="/manage/places/$placeId/listings"
                  params={proxyParams}
                  onClick={rememberProxy}
                >
                  掲載を代行
                </ChipLink>
              )}
              <ChipLink
                to="/manage/places/$placeId/listings/new"
                params={proxyParams}
                onClick={rememberProxy}
              >
                掲載を追加（代行）
              </ChipLink>
            </div>
          </section>
        ) : null}

        {!resolved && !vacant && !listingGone ? (
          <section className="m-section" aria-labelledby="om05-request">
            <hr className="m-divider" />
            <SectionTitle variant="manage" id="om05-request">
              店舗管理者への確認の依頼
            </SectionTitle>
            {status === "open" ? (
              <div className="m-section">
                <p className="om05-text">
                  {`連絡の内容を添えて、${placeName}のすべての店舗管理者（${stewardCount}人）に確認を依頼します。依頼は取り消せません。`}
                </p>
                <Button
                  variant="secondary"
                  className="om05-act"
                  disabled={pending}
                  onClick={() => setConfirming("request")}
                >
                  店舗管理者に確認を依頼する
                </Button>
              </div>
            ) : (
              <dl className="om-facts">
                <div>
                  <dt>依頼</dt>
                  <dd>
                    {`${
                      data.requestedAt === null
                        ? "依頼済み"
                        : `${dayText(data.requestedAt)}に依頼済み`
                    } · 店舗管理者 ${stewardCount}人に届きました`}
                  </dd>
                </div>
              </dl>
            )}
          </section>
        ) : null}
      </ManageBody>

      <ConfirmDialog
        open={confirming === "request"}
        title="店舗管理者に確認を依頼しますか"
        confirmLabel="依頼する"
        pending={pending}
        onConfirm={() => run("request")}
        onCancel={() => setConfirming(null)}
      >
        <ul>
          <li>{`${placeName}のすべての店舗管理者（${stewardCount}人）に、連絡の内容を添えた依頼が届きます`}</li>
          <li>連絡は確認依頼中になります</li>
          <li>依頼は取り消せません</li>
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === "resolve"}
        title="対応を終えますか"
        confirmLabel="対応を終える"
        pending={pending}
        onConfirm={() => run("resolve")}
        onCancel={() => setConfirming(null)}
      >
        <ul>
          <li>連絡は対応済みになります</li>
          <li>対応を終えた連絡は、取り消せません</li>
        </ul>
      </ConfirmDialog>
    </ManagePage>
  );
}

/** OM-05 when the report could not be read (a missing report, CS-02). */
export function InfoReportProblem({ missing }: { missing: boolean }) {
  return (
    <ManagePage title={<Title />} nav={<OpsNav current="inbox" />}>
      <ManageBody>
        <EmptyPanel
          title={missing ? "この連絡は見つかりません" : "読み込めませんでした"}
          actions={<ButtonLink to="/ops">対応が必要なものへ戻る</ButtonLink>}
        >
          {missing
            ? "連絡が存在しません。対応が必要なものから開き直してください。"
            : "通信を確かめて、もう一度開いてください。"}
        </EmptyPanel>
      </ManageBody>
    </ManagePage>
  );
}
