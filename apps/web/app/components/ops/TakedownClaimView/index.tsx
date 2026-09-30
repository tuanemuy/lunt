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
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/ChipButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Field, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import { TextLink } from "@/components/ui/TextButton";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import {
  type ClaimPhoto,
  dayText,
  detailPath,
  resolveTakedownClaimFn,
  STANDING_LABEL,
  type TakeDownPhotosResult,
  type TakedownClaimData,
  type TakedownTargetKind,
  takeDownPhotosByClaimFn,
} from "@/presentation/moderation";
import { useReconcile } from "@/presentation/reconcile";
import { OpsNav } from "../OpsShell";

const CODE_ALREADY_RESOLVED = "MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED";

const KIND_LABEL = {
  place: "店舗",
  listing: "掲載",
  region: "地域",
  occasion: "イベント",
  article: "読みもの",
} as const;

type TargetKind = TakedownClaimData["target"]["kind"];

/** The claim's target as the operations name it. */
const operableTarget = (
  target: TakedownClaimData["target"],
): Readonly<{ kind: TakedownTargetKind; id: string }> => ({
  kind: target.kind,
  id: target.id,
});

/** OM-03's kinds: every target but an article (OM-03 「読みものは対象にしない」). */
const subjectOf = (
  target: TakedownClaimData["target"],
): Readonly<{
  kind: Exclude<TakedownTargetKind, "article">;
  id: string;
}> | null =>
  target.kind === "article" ? null : { kind: target.kind, id: target.id };

/** The word for a publication that lost its last photo (CF-08). */
const withdrawnWord = (kind: TargetKind): string =>
  kind === "listing" ? "一時非公開" : "公開の取り下げ";

function Title() {
  return (
    <ManageTitle>
      <TextLink to="/ops" className="om04-back">
        対応が必要なものへ戻る
      </TextLink>
      <p className="om-kind">取り下げの申立て</p>
      <ManageHeading>申立ての対応</ManageHeading>
    </ManageTitle>
  );
}

type PhotoOutcome =
  | Readonly<{
      kind: "removed";
      result: TakeDownPhotosResult;
      wasCover: boolean;
      remaining: number;
    }>
  | Readonly<{ kind: "gone" }>
  | Readonly<{ kind: "failed"; error: ErrorState; photoId: string }>;

type FinishOutcome =
  | Readonly<{ kind: "done" }>
  | Readonly<{ kind: "failed"; error: ErrorState }>;

function removalText(
  data: TakedownClaimData,
  outcome: Extract<PhotoOutcome, { kind: "removed" }>,
): string {
  const name = data.target.name ?? KIND_LABEL[data.target.kind];
  const withdrawn = withdrawnWord(data.target.kind);
  const state =
    data.target.kind === "place"
      ? `${name}は、公開を続けています。`
      : outcome.result.unpublished
        ? `写真がなくなったため、${name}は${withdrawn}になりました。閲覧者には表示されません。`
        : outcome.result.publication === "published"
          ? `${name}は、公開を続けています。`
          : outcome.result.publication === "unpublished"
            ? `${name}は、${withdrawn}のままです。`
            : `${name}の公開の状態は変わっていません。`;
  const cover =
    outcome.wasCover && outcome.remaining > 0
      ? "次の写真が代表写真になりました。"
      : "";
  const more = outcome.remaining > 0 ? "続けて、別の写真も削除できます。" : "";
  return `${state}${cover}${more}`;
}

/**
 * OM-04 申立ての対応 (MOD-02): the claim, its target as it is now, the
 * target's photos to remove one at a time (each confirmed, CS-12, and
 * applied at once), and the outcome that closes the claim and is mailed
 * to the claimant. The photo list is owned here: a removal takes the row
 * out optimistically and the reconcile brings the stored photos.
 */
export function TakedownClaimView({ data }: { data: TakedownClaimData }) {
  const reconcile = useReconcile();
  const [photos, removePhoto] = useOptimistic<readonly ClaimPhoto[], string>(
    data.photos,
    (current, photoId) => current.filter((photo) => photo.photoId !== photoId),
  );
  const [confirmingPhoto, setConfirmingPhoto] = useState<string | null>(null);
  const [photoOutcome, setPhotoOutcome] = useState<PhotoOutcome | null>(null);
  const [removing, startRemoval] = useTransition();

  const [outcomeText, setOutcomeText] = useState("");
  const [outcomeMissing, setOutcomeMissing] = useState(false);
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [finishOutcome, setFinishOutcome] = useState<FinishOutcome | null>(
    null,
  );
  const [finishing, startFinish] = useTransition();

  const open = data.status === "open";
  const { targetState } = data;
  const gone = targetState.kind === "gone";
  const targetName = data.target.name ?? "（削除された対象）";
  const kindLabel = KIND_LABEL[data.target.kind];
  const operable = operableTarget(data.target);
  const subject = subjectOf(data.target);
  const alreadyResolvedElsewhere =
    (photoOutcome?.kind === "failed" &&
      photoOutcome.error.code === CODE_ALREADY_RESOLVED) ||
    (finishOutcome?.kind === "failed" &&
      finishOutcome.error.code === CODE_ALREADY_RESOLVED);

  const removeConfirmed = (photoId: string) => {
    const index = photos.findIndex((photo) => photo.photoId === photoId);
    setConfirmingPhoto(null);
    setPhotoOutcome(null);
    setOutcomeMissing(false);
    startRemoval(async () => {
      removePhoto(photoId);
      let outcome: PhotoOutcome;
      try {
        const result = await takeDownPhotosByClaimFn({
          data: {
            claimId: data.claimId,
            target: operable,
            photoIds: [photoId],
          },
        });
        outcome = {
          kind: "removed",
          result,
          wasCover: index === 0,
          remaining: photos.length - 1,
        };
      } catch (error) {
        const state = classifyError(error);
        outcome =
          state.kind === "premiseChanged" &&
          (state.code?.endsWith("_PHOTO_NOT_FOUND") ?? false)
            ? { kind: "gone" }
            : { kind: "failed", error: state, photoId };
      }
      // Set inside the transition (a set after an await is not), so the
      // message lands in the commit that shows the reconciled target state.
      startRemoval(() => setPhotoOutcome(outcome));
      await reconcile();
    });
  };

  const startFinishing = () => {
    if (outcomeText.trim() === "") {
      setOutcomeMissing(true);
      setFinishOutcome(null);
      document.getElementById("om04-outcome")?.focus();
      return;
    }
    setOutcomeMissing(false);
    setConfirmingFinish(true);
  };

  const finish = () => {
    setConfirmingFinish(false);
    setFinishOutcome(null);
    setPhotoOutcome(null);
    startFinish(async () => {
      let outcome: FinishOutcome;
      try {
        await resolveTakedownClaimFn({
          data: { claimId: data.claimId, outcome: outcomeText },
        });
        outcome = { kind: "done" };
      } catch (error) {
        outcome = { kind: "failed", error: classifyError(error) };
      }
      startFinish(() => setFinishOutcome(outcome));
      await reconcile();
    });
  };

  const confirmingIndex =
    confirmingPhoto === null
      ? -1
      : photos.findIndex((photo) => photo.photoId === confirmingPhoto);
  const confirmingLast = photos.length === 1;
  const lastConsequence =
    data.target.kind === "place"
      ? "写真がなくなっても、店舗は公開を続けます"
      : data.target.kind === "listing"
        ? "写真がなくなるため、掲載は一時非公開になります。運営による非公開の間の掲載も同じです"
        : data.target.kind === "article"
          ? "写真がなくなるため、公開中の読みものは公開の取り下げになります"
          : `写真がなくなるため、${kindLabel}は公開の取り下げになります。運営による非公開の間の${kindLabel}も同じです`;

  return (
    <ManagePage
      title={<Title />}
      nav={<OpsNav current="inbox" />}
      {...(open
        ? {
            actions: (
              <Button onClick={startFinishing} disabled={finishing}>
                {finishing ? "対応を終えています…" : "対応を終える"}
              </Button>
            ),
            ...(outcomeText !== ""
              ? {
                  actionsNote:
                    "結果はまだ送っていません。対応を終えずに画面を離れると、入力した結果は残りません。",
                }
              : {}),
          }
        : {})}
    >
      <ManageBody>
        {open ? (
          <ManageStatus tone="alert">
            {`未対応 · ${dayText(data.receivedAt)}に受付`}
          </ManageStatus>
        ) : (
          <ManageStatus>{`対応済み · ${dayText(data.receivedAt)}に受付`}</ManageStatus>
        )}

        {alreadyResolvedElsewhere ? (
          <Alert
            title="この申立ては、すでに対応済みです"
            actions={
              <ButtonLink variant="secondary" to="/ops">
                対応が必要なものへ戻る
              </ButtonLink>
            }
          >
            別のサービス運営者が先に対応を終えていました。操作は反映していません。添えられた結果を示しています。
          </Alert>
        ) : null}
        {photoOutcome?.kind === "gone" ? (
          <Alert title="この写真は、すでに対象にありません">
            写真はすでに対象から外されていました。削除は反映していません。対象の現在の写真を示しています。
          </Alert>
        ) : null}
        {photoOutcome?.kind === "failed" && !alreadyResolvedElsewhere ? (
          <Alert
            title="写真を削除できませんでした"
            {...(photoOutcome.error.kind === "failed"
              ? {
                  actions: (
                    <Button
                      variant="secondary"
                      disabled={removing}
                      onClick={() => removeConfirmed(photoOutcome.photoId)}
                    >
                      もう一度削除
                    </Button>
                  ),
                }
              : {})}
          >
            {photoOutcome.error.kind === "failed"
              ? "通信を確かめて、もう一度削除してください。写真と入力した結果は、そのまま残っています。"
              : photoOutcome.error.message}
          </Alert>
        ) : null}
        {finishOutcome?.kind === "failed" && !alreadyResolvedElsewhere ? (
          <Alert title="対応を終えられませんでした">
            {finishOutcome.error.kind === "failed"
              ? "通信を確かめて、もう一度対応を終えてください。入力した結果は残っています。"
              : finishOutcome.error.message}
          </Alert>
        ) : null}
        {outcomeMissing && open ? (
          <Alert
            title="対応を終えられませんでした"
            list={
              <li>
                <a className="m-link" href="#om04-outcome">
                  結果
                </a>
              </li>
            }
          >
            結果を入力してください。措置を行わないときも、そのことを結果に書きます。
          </Alert>
        ) : null}
        <div role="status">
          {photoOutcome?.kind === "removed" ? (
            <Notice variant="manage" title="写真を削除しました">
              {removalText(data, photoOutcome)}
            </Notice>
          ) : null}
          {finishOutcome?.kind === "done" ? (
            <Notice variant="manage" title="対応を終えました">
              申立ては対応済みになり、結果を申立人にメールで送りました。
            </Notice>
          ) : null}
        </div>

        <ManageSection id="om04-claim" title="申立ての内容">
          <dl className="om-facts">
            <div>
              <dt>状態</dt>
              <dd>
                {open ? (
                  <Badge tone="alert">未対応</Badge>
                ) : (
                  <Badge tone="accent">対応済み</Badge>
                )}
              </dd>
            </div>
            <div>
              <dt>対象</dt>
              <dd>
                {`${kindLabel} · ${targetName}${
                  data.target.placeName === null
                    ? ""
                    : `（${data.target.placeName}）`
                }`}
              </dd>
            </div>
            <div>
              <dt>申立人の立場</dt>
              <dd>{STANDING_LABEL[data.standing]}</dd>
            </div>
            {data.claimedCount > 0 ? (
              <div>
                <dt>示された写真</dt>
                <dd>
                  {`${data.claimedCount}枚${
                    data.removedClaimedCount > 0
                      ? `（うち${data.removedClaimedCount}枚は、すでに対象から外されています）`
                      : ""
                  }`}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>理由</dt>
              <dd className="om04-text">{data.reason}</dd>
            </div>
            <div>
              <dt>申立人のメールアドレス</dt>
              <dd>
                {data.email}
                <br />
                <span className="m-field__help">
                  追加の確認は、このアドレスにメールで行います。
                </span>
              </dd>
            </div>
          </dl>
        </ManageSection>

        <hr className="m-divider" />

        <ManageSection id="om04-target" title="対象の現在の状態">
          <dl className="om-facts">
            <div>
              <dt>公開の状態</dt>
              <dd>
                {targetState.kind === "gone" ? (
                  <>
                    <Badge tone="muted">削除済み</Badge>
                    {` この${kindLabel}は、すでに削除されています`}
                  </>
                ) : (
                  `${targetState.stateText} · ${
                    targetState.viewable
                      ? "閲覧できる"
                      : "閲覧者には表示されていません"
                  }`
                )}
              </dd>
            </div>
            {gone ? null : (
              <div>
                <dt>写真</dt>
                <dd>
                  {photos.length === 0 ? "ありません" : `${photos.length}枚`}
                </dd>
              </div>
            )}
          </dl>
          {targetState.kind === "present" && targetState.suspended ? (
            <Notice
              variant="manage"
              tone="paper"
              title={`この${kindLabel}は、すでに非公開です`}
            >
              運営による非公開の間も、写真は削除できます。追加の措置が要るかを判断して、結果を添えて対応を終えます。
            </Notice>
          ) : null}
          {gone ? null : (
            <LinkList>
              {targetState.kind === "present" && targetState.viewable ? (
                <li>
                  <ListRowLink
                    to={detailPath(operable.kind, operable.id)}
                    title={
                      operable.kind === "article"
                        ? "閲覧者に見える記事"
                        : `閲覧者に見える${kindLabel}詳細`
                    }
                    meta={targetName}
                  />
                </li>
              ) : null}
              {subject !== null ? (
                <li>
                  <ListRowLink
                    to="/ops/subjects/$kind/$id"
                    params={{ kind: subject.kind, id: subject.id }}
                    title="対象の運営"
                    meta={
                      data.standing === "proprietor"
                        ? "店舗本人の申立ては、掲載・店舗を非公開にしてから対応を終えられます"
                        : subject.kind === "region" ||
                            subject.kind === "occasion"
                          ? `${kindLabel}の運営による非公開は、対象の運営で行います`
                          : "掲載と店舗の非公開は、対象の運営で行います"
                    }
                  />
                </li>
              ) : null}
            </LinkList>
          )}
        </ManageSection>

        {open && !gone ? (
          <>
            <hr className="m-divider" />
            <ManageSection id="om04-photos" title="対象の写真">
              {data.removedClaimedCount > 0 ? (
                <Notice
                  variant="manage"
                  tone="paper"
                  title="申立人が示した写真は、すでに対象から外されています"
                >
                  {photos.length === 0
                    ? "対象に写真は残っていないため、削除する写真はありません。対象の運営へ進むか、結果を添えて対応を終えます。"
                    : "残る写真を確かめて、削除が要るかを判断します。"}
                </Notice>
              ) : null}
              {photos.length === 0 ? (
                data.removedClaimedCount > 0 ? null : (
                  <Notice
                    variant="manage"
                    tone="paper"
                    title="対象に写真がありません"
                  >
                    削除する写真はありません。対象の運営へ進むか、結果を添えて対応を終えます。
                  </Notice>
                )
              ) : (
                <>
                  <ul className="m-photos">
                    {photos.map((photo, index) => (
                      <li className="m-photos__item" key={photo.photoId}>
                        <span className="m-photos__thumb">
                          {photo.url === null ? null : (
                            <img
                              src={photo.url}
                              alt={`${index + 1}枚目の写真`}
                            />
                          )}
                        </span>
                        <span className="m-photos__text">
                          <span className="m-row__name">
                            {index === 0
                              ? `${index + 1}枚目 · 代表写真`
                              : `${index + 1}枚目`}
                          </span>
                          {photo.claimed ? (
                            <Badge tone="alert">申立人が示した写真</Badge>
                          ) : null}
                        </span>
                        <span className="m-photos__ops">
                          <ChipButton
                            aria-label={`${index + 1}枚目を削除`}
                            disabled={removing}
                            onClick={() => setConfirmingPhoto(photo.photoId)}
                          >
                            削除
                          </ChipButton>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="m-field__help">
                    削除は確定した時点で反映し、対応を終える操作を待ちません。削除した写真は戻せません。
                  </p>
                </>
              )}
            </ManageSection>
          </>
        ) : null}

        <hr className="m-divider" />

        {open ? (
          <ManageSection id="om04-result" title="結果">
            {gone ? (
              <Notice
                variant="manage"
                tone="paper"
                title="対象がないため、措置は行えません"
              >
                措置を行わないことを結果に書いて、対応を終えます。
              </Notice>
            ) : null}
            <Field
              id="om04-outcome"
              label="行った措置、または措置を行わないこと"
              requirement="required"
              help="対応を終えると、この結果が申立人にメールで届きます。送った結果は変えられません。"
              {...(outcomeMissing ? { error: "結果を入力してください。" } : {})}
            >
              {(control) => (
                <Textarea
                  {...control}
                  className="om04-result"
                  rows={4}
                  placeholder="例: 申し立てられた写真を削除しました。"
                  value={outcomeText}
                  onChange={(event) => {
                    const text = event.currentTarget.value;
                    setOutcomeText(text);
                    if (text.trim() !== "") setOutcomeMissing(false);
                  }}
                />
              )}
            </Field>
          </ManageSection>
        ) : (
          <ManageSection id="om04-result-done" title="添えた結果">
            <Notice
              variant="manage"
              tone="paper"
              title="申立人にメールで送信済み"
            >
              <span className="om04-text">{data.outcome ?? ""}</span>
            </Notice>
            <p className="m-field__help">
              対応済みの申立ては、未対応に戻せません。措置の結果は、対象の現在の状態と対象の運営で確かめます。
            </p>
            {alreadyResolvedElsewhere ? null : (
              <ButtonLink to="/ops" className="om04-next">
                次の申立て・連絡へ（対応が必要なもの）
              </ButtonLink>
            )}
          </ManageSection>
        )}
      </ManageBody>

      <ConfirmDialog
        open={confirmingPhoto !== null}
        title={
          confirmingLast
            ? "最後の写真を削除しますか"
            : `${confirmingIndex + 1}枚目の写真を削除しますか`
        }
        confirmLabel="削除する"
        pending={removing}
        onConfirm={() => {
          if (confirmingPhoto !== null) removeConfirmed(confirmingPhoto);
        }}
        onCancel={() => setConfirmingPhoto(null)}
      >
        <p>確定すると、すぐに対象から写真が外れます。</p>
        <ul>
          <li>削除した写真は戻せません</li>
          {confirmingLast ? (
            <li>{lastConsequence}</li>
          ) : (
            <>
              {confirmingIndex === 0 ? (
                <li>1枚目を削除すると、2枚目が代表写真になります</li>
              ) : null}
              <li>{`写真が残るため、${kindLabel}は${
                data.target.kind === "place"
                  ? "公開を続けます"
                  : "いまの公開状態のままです"
              }`}</li>
            </>
          )}
          {confirmingLast && data.target.kind === "listing" ? (
            <li>店舗管理者が写真を登録して公開すると、再び公開されます</li>
          ) : null}
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmingFinish}
        title="対応を終えますか"
        confirmLabel="対応を終える"
        pending={finishing}
        onConfirm={finish}
        onCancel={() => setConfirmingFinish(false)}
      >
        <ul>
          <li>申立ては対応済みになります</li>
          <li>{`入力した結果が、申立人（${data.email}）にメールで届きます`}</li>
          <li>対応を終えた申立ては、取り消せません</li>
        </ul>
      </ConfirmDialog>
    </ManagePage>
  );
}

/** OM-04 when the claim could not be read (CS-17-like missing claim, CS-02). */
export function TakedownClaimProblem({ missing }: { missing: boolean }) {
  return (
    <ManagePage title={<Title />} nav={<OpsNav current="inbox" />}>
      <ManageBody>
        <EmptyPanel
          title={
            missing ? "この申立ては見つかりません" : "読み込めませんでした"
          }
          actions={<ButtonLink to="/ops">対応が必要なものへ戻る</ButtonLink>}
        >
          {missing
            ? "申立てが存在しません。対応が必要なものから開き直してください。"
            : "通信を確かめて、もう一度開いてください。"}
        </EmptyPanel>
      </ManageBody>
    </ManagePage>
  );
}
