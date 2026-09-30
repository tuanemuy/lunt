"use client";

import { useNavigate, useRouter } from "@tanstack/react-router";
import { useRef, useState, useTransition } from "react";
import { ManageBody, ManageStatus } from "@/components/layout/ManageShell";
import {
  listingPagePath,
  placePagePath,
  ShopPage,
} from "@/components/manage/ShopShell";
import { usePlaceFrame } from "@/components/manage/ShopShell/usePlaceFrame";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TextLink } from "@/components/ui/TextButton";
import {
  followDraft,
  isDirty,
  reloadDraft,
  savedDraft,
  settledDraft,
  useEditDraft,
} from "@/presentation/editDraft";
import { classifyError } from "@/presentation/errorState";
import {
  duplicateListingFn,
  type ListingTransition,
  listingPublishPremiseFn,
  transitionListingFn,
  updateListingFn,
} from "@/presentation/listing";
import {
  listingFieldErrors,
  listingFormValuesOf,
  REPICK_CODES,
  toListingContent,
} from "@/presentation/listingForm";
import {
  type CategoryOption,
  type ListingEditorData,
  listingStateText,
  offeringPhaseLabel,
  offeringStatusText,
  publicationLabel,
} from "@/presentation/listingView";
import { newId } from "@/presentation/newId";
import { publishSaveFailure } from "@/presentation/publishPremise";
import { useReconcile } from "@/presentation/reconcile";
import {
  type ListingFailure,
  ListingFailureAlert,
} from "../ListingFailureAlert";
import { ListingFormFields } from "../ListingFormFields";

/** The last completed operation, shown in place of the form or above it (CS-13). */
type Outcome =
  | Readonly<{ kind: "draftSaved"; offeringBefore: string | null }>
  | Readonly<{ kind: "saved"; published: boolean; offeringBefore: string }>
  | Readonly<{ kind: "published" }>
  | Readonly<{ kind: "notice"; title: string; body: string }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "lostAccess" }>;

const NOTICES: Readonly<
  Record<
    Exclude<ListingTransition, "publish" | "delete" | "suspend" | "unsuspend">,
    Readonly<{ title: string; body: string }>
  >
> = {
  unpublish: {
    title: "一時非公開にしました",
    body: "閲覧者には表示されていません。再公開すると、また表示されます。",
  },
  endOffering: {
    title: "提供を終了しました",
    body: "提供終了として表示されます。あとから提供中に戻せます。",
  },
  resumeOffering: {
    title: "提供中に戻しました",
    body: "提供状態は、提供期間・開催日と今日の日付に従います。",
  },
};

type Confirming = "unpublish" | "endOffering" | "delete" | null;

/** The duplication whose outcome is not known to be final, resent with the same id. */
type DuplicateAttempt = { id: string };

type ListingEditorProps = {
  data: ListingEditorData;
  categories: readonly CategoryOption[];
  /** Arrived here by duplicating this source (its name when still there). */
  copiedFrom: Readonly<{ name: string | null }> | null;
  /** Arrived here by saving a new draft (CS-13 下書きを保存しました). */
  created: boolean;
};

/**
 * SM-04 掲載の編集: the content saved in any state (LST-06), the
 * publication changed (CF-08: publish, unpublish, re-publish; LST-04,
 * LST-07), the offering ended and resumed (LST-08), duplicated (LST-09)
 * and deleted (LST-10). The steward, or an operator standing in (CS-14).
 */
export function ListingEditor({
  data,
  categories,
  copiedFrom,
  created,
}: ListingEditorProps) {
  const frame = usePlaceFrame();
  const router = useRouter();
  const navigate = useNavigate();
  const reconcile = useReconcile();
  const proxy = frame.basis === "proxy";
  const params = { placeId: data.place.id, listingId: data.id };

  const [draft, setDraft] = useEditDraft(data, listingFormValuesOf);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const { values } = draft;
  const dirty = isDirty(draft);
  const [outcome, setOutcome] = useState<Outcome | null>(
    created ? { kind: "draftSaved", offeringBefore: null } : null,
  );
  const [failure, setFailure] = useState<ListingFailure | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [resumed, setResumed] = useState(false);
  const [busy, startBusy] = useTransition();
  const duplicateAttempt = useRef<DuplicateAttempt | null>(null);

  const begin = () => {
    setFailure(null);
    setDraft(settledDraft);
  };
  /** Saves the form as it is; the reply's version is the one the next save sends. */
  const saveValues = async () => {
    const { values: submitted, version } = draftRef.current;
    const saved = await updateListingFn({
      data: {
        listingId: data.id,
        version,
        content: toListingContent(submitted),
      },
    });
    setDraft((current) => savedDraft(current, submitted, saved.version));
  };

  const fail = async (
    error: unknown,
    attempt: ListingFailure["attempt"],
    savedFirst = false,
  ) => {
    const state = classifyError(error);
    if (state.kind === "notFound") {
      setOutcome({ kind: "missing" });
      return;
    }
    if (state.kind === "forbidden" && !proxy) {
      setOutcome({ kind: "lostAccess" });
      router.clearCache();
      return;
    }
    setFailure({
      state,
      fields: listingFieldErrors(state),
      attempt,
      savedFirst,
    });
    if (state.kind === "premiseChanged" || savedFirst) {
      const repick =
        state.kind === "premiseChanged" &&
        state.code !== null &&
        REPICK_CODES[state.code] !== undefined;
      if (repick) {
        // CS-08 for a retired category: keep the input, clear the
        // retired choice, and reload the active categories to pick from.
        setDraft((current) => ({
          ...current,
          values: { ...current.values, categoryId: "" },
        }));
      } else if (!savedFirst) {
        setDraft(followDraft);
      }
      await reconcile();
    }
  };

  const save = () =>
    startBusy(async () => {
      begin();
      setOutcome(null);
      const offeringBefore = offeringPhaseLabel(data.offeringStatus);
      try {
        await saveValues();
        // Wrapped again after the await, so the outcome lands with the
        // reconciled data it compares the offering status against.
        startBusy(() =>
          setOutcome(
            data.publication.status === "draft"
              ? { kind: "draftSaved", offeringBefore }
              : {
                  kind: "saved",
                  published: data.publication.status === "published",
                  offeringBefore,
                },
          ),
        );
        await reconcile();
      } catch (error) {
        await fail(error, "save");
      }
    });

  const publish = () =>
    startBusy(async () => {
      begin();
      setOutcome(null);
      let savedFirst = false;
      try {
        if (isDirty(draftRef.current)) {
          await saveValues().catch(async (error: unknown) => {
            throw await publishSaveFailure(error, "LISTING", () =>
              listingPublishPremiseFn({ data: params }),
            );
          });
          savedFirst = true;
        }
        await transitionListingFn({
          data: { listingId: data.id, transition: "publish" },
        });
        setOutcome({ kind: "published" });
        await reconcile();
      } catch (error) {
        await fail(error, "publish", savedFirst);
      }
    });

  const transition = (kind: keyof typeof NOTICES) =>
    startBusy(async () => {
      setConfirming(null);
      begin();
      setOutcome(null);
      try {
        await transitionListingFn({
          data: { listingId: data.id, transition: kind },
        });
        setOutcome({ kind: "notice", ...NOTICES[kind] });
        await reconcile();
      } catch (error) {
        await fail(error, "operation");
      }
    });

  const remove = () =>
    startBusy(async () => {
      begin();
      try {
        await transitionListingFn({
          data: { listingId: data.id, transition: "delete" },
        });
        setConfirming(null);
        await navigate({
          to: "/manage/places/$placeId/listings",
          params: { placeId: data.place.id },
          search: { deleted: true },
          replace: true,
        });
      } catch (error) {
        setConfirming(null);
        await fail(error, "operation");
      }
    });

  const duplicate = () =>
    startBusy(async () => {
      begin();
      duplicateAttempt.current ??= { id: newId() };
      try {
        const copy = await duplicateListingFn({
          data: { sourceId: data.id, listingId: duplicateAttempt.current.id },
        });
        duplicateAttempt.current = null;
        await navigate({
          to: "/manage/places/$placeId/listings/$listingId",
          params: { placeId: data.place.id, listingId: copy.listingId },
          search: { copyFrom: data.id },
        });
      } catch (error) {
        await fail(error, "operation");
      }
    });

  const name = data.name === "" ? "名称未設定" : data.name;
  const status = data.offeringStatus;
  const published = data.publication.status === "published";
  const viewable = published && !data.suspended && !data.place.suspended;

  if (outcome?.kind === "missing" || outcome?.kind === "lostAccess") {
    return (
      <ShopPage frame={frame} heading="掲載を編集">
        <ManageBody>
          <FocusOnMount role="alert">
            {outcome.kind === "missing" ? (
              <EmptyPanel
                title="この掲載は削除されています"
                actions={
                  <ButtonLink
                    to="/manage/places/$placeId/listings"
                    params={{ placeId: data.place.id }}
                  >
                    掲載の一覧へ戻る
                  </ButtonLink>
                }
              >
                掲載がないため、編集と操作は反映していません。
              </EmptyPanel>
            ) : (
              <EmptyPanel
                title="この店舗の店舗管理者ではありません"
                actions={<ButtonLink to="/me">マイページへ</ButtonLink>}
              >
                この掲載は、店舗管理者だけが編集できます。変更は保存していません。
              </EmptyPanel>
            )}
          </FocusOnMount>
        </ManageBody>
      </ShopPage>
    );
  }

  if (
    outcome?.kind === "draftSaved" ||
    outcome?.kind === "saved" ||
    outcome?.kind === "published"
  ) {
    const offeringNow = offeringPhaseLabel(status);
    const offeringChanged =
      outcome.kind !== "published" &&
      outcome.offeringBefore !== null &&
      outcome.offeringBefore !== offeringNow
        ? `提供状態が「${offeringNow}」に変わりました。`
        : "";
    const keepEditing = (
      <Button
        variant="secondary"
        onClick={() => {
          setOutcome(null);
          setResumed(true);
          if (created) {
            void navigate({
              to: "/manage/places/$placeId/listings/$listingId",
              params,
              search: {},
              replace: true,
            });
          }
        }}
      >
        編集を続ける
      </Button>
    );
    return (
      <ShopPage frame={frame} heading="掲載を編集">
        <FocusOnMount>
          {outcome.kind === "draftSaved" ? (
            <DonePanel
              title="下書きを保存しました"
              actions={
                <>
                  {keepEditing}
                  <ButtonLink
                    variant="secondary"
                    to="/manage/places/$placeId/listings/$listingId/preview"
                    params={params}
                  >
                    公開前に確認
                  </ButtonLink>
                  {data.suspended ? null : (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={publish}
                    >
                      確認せずに公開する
                    </Button>
                  )}
                </>
              }
            >
              {`この掲載はまだ公開されていません。あとから続きを編集できます。${offeringChanged}`}
            </DonePanel>
          ) : outcome.kind === "saved" ? (
            <DonePanel
              title="掲載を保存しました"
              actions={
                <>
                  {outcome.published && viewable ? (
                    <ButtonLink to={listingPagePath(data.id)}>
                      掲載ページを見る
                    </ButtonLink>
                  ) : null}
                  {keepEditing}
                  <ButtonLink
                    variant="secondary"
                    to="/manage/places/$placeId/listings"
                    params={{ placeId: data.place.id }}
                  >
                    掲載の一覧へ
                  </ButtonLink>
                </>
              }
            >
              {`${
                !outcome.published
                  ? "この掲載は一時非公開のままです。"
                  : data.suspended
                    ? "変更を保存しました。この掲載は運営による非公開のため、閲覧者には表示されていません。"
                    : data.place.suspended
                      ? "変更を保存しました。店舗が非公開のため、閲覧者には表示されていません。"
                      : "公開中の掲載に変更を反映しました。"
              }${offeringChanged}`}
            </DonePanel>
          ) : (
            <DonePanel
              title="公開しました"
              actions={
                <>
                  {proxy ? (
                    <ButtonLink
                      to="/manage/places/$placeId/listings"
                      params={{ placeId: data.place.id }}
                    >
                      掲載の一覧へ
                    </ButtonLink>
                  ) : (
                    <ButtonLink
                      to="/manage/places/$placeId"
                      params={{ placeId: data.place.id }}
                    >
                      店舗ホームに戻る
                    </ButtonLink>
                  )}
                  <ButtonLink variant="secondary" to={listingPagePath(data.id)}>
                    掲載詳細を見る
                  </ButtonLink>
                  <ButtonLink
                    variant="secondary"
                    to={placePagePath(data.place.id)}
                  >
                    店舗ページを見る
                  </ButtonLink>
                </>
              }
            >
              {data.place.suspended
                ? `${name}を公開しました。店舗の非公開が解除されると、閲覧者に表示されます。`
                : `${name}を公開しました。店舗ページと掲載詳細から見られます。`}
            </DonePanel>
          )}
        </FocusOnMount>
      </ShopPage>
    );
  }

  const statusLine = (
    <ManageStatus
      tone={
        data.suspended || data.publication.reason === "photoTakedown"
          ? "alert"
          : published
            ? "accent"
            : "neutral"
      }
    >
      {`${listingStateText(data.publication, data.suspended, status)} · ${data.place.name}`}
    </ManageStatus>
  );
  const unpublished = data.publication.status === "unpublished";
  const draftState = data.publication.status === "draft";
  const previewLink = (
    <ButtonLink
      to="/manage/places/$placeId/listings/$listingId/preview"
      params={params}
    >
      公開前に確認
    </ButtonLink>
  );
  const saveButton = (
    <Button
      type="submit"
      form="listing-form"
      variant={published ? "primary" : "secondary"}
      disabled={busy}
    >
      {busy ? "保存しています…" : draftState ? "下書きを保存" : "変更を保存"}
    </Button>
  );

  return (
    <ShopPage
      frame={frame}
      heading="掲載を編集"
      actions={
        published ? (
          saveButton
        ) : (
          <>
            {previewLink}
            {saveButton}
          </>
        )
      }
      {...(dirty
        ? {
            actionsNote:
              "保存していない変更があります。保存せずに画面を離れると、変更は残りません。",
          }
        : {})}
    >
      <form
        className="m-body"
        id="listing-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {resumed ? <FocusOnMount>{statusLine}</FocusOnMount> : statusLine}
        {failure === null ? null : (
          <ListingFailureAlert
            failure={failure}
            placeId={data.place.id}
            proxy={proxy}
            unpublishable={!data.suspended}
            busy={busy}
            onReload={() =>
              startBusy(async () => {
                setDraft(reloadDraft);
                await reconcile();
                setFailure(null);
              })
            }
            retry={
              failure.attempt === "save" ? (
                <Button type="submit" variant="secondary" disabled={busy}>
                  もう一度保存
                </Button>
              ) : failure.attempt === "publish" ? (
                <Button variant="secondary" disabled={busy} onClick={publish}>
                  もう一度公開
                </Button>
              ) : undefined
            }
          />
        )}
        <div role="status">
          {outcome?.kind === "notice" ? (
            <Notice variant="manage" title={outcome.title}>
              {outcome.body}
            </Notice>
          ) : null}
        </div>
        {copiedFrom === null ? null : (
          <div role="status">
            <Notice
              variant="manage"
              tone="paper"
              title={
                copiedFrom.name === null
                  ? "複製した下書きです"
                  : `「${copiedFrom.name}」を複製した下書きです`
              }
            >
              名称・紹介文・カテゴリー・写真を引き継ぎました。提供期間と開催日は引き継いでいません。元の掲載は変わっていません。
            </Notice>
          </div>
        )}
        {data.photosTakenDown ? (
          <div role="status">
            <Notice
              variant="manage"
              tone="paper"
              title="申立てにより、掲載の写真が削除されました"
              actions={
                <a className="text-button" href="#photos">
                  写真を登録する
                </a>
              }
            >
              {data.publication.reason === "photoTakedown"
                ? "写真がなくなったため、この掲載は一時非公開になっています。写真を登録して保存し、再公開すると、閲覧者に表示されます。"
                : "写真を登録して保存すると、この表示は消えます。"}
            </Notice>
          </div>
        ) : null}
        {data.suspended ? (
          <Notice
            variant="manage"
            tone="paper"
            title="運営により非公開になっています"
          >
            閲覧者には表示されていません。解除できるのはサービス運営者だけです。そのほかの編集と提供状態の操作は、いつもどおり行えます。
          </Notice>
        ) : null}
        {data.place.suspended ? (
          <Notice variant="manage" tone="paper" title="この店舗は非公開です">
            店舗の非公開が解除されるまで、店舗と掲載は閲覧者に表示されません。操作は、これまでどおり行えます。
          </Notice>
        ) : null}

        <ListingFormFields
          values={values}
          onChange={(change) =>
            setDraft((current) => ({
              ...current,
              values: { ...current.values, ...change },
            }))
          }
          errors={failure?.fields ?? {}}
          categories={categories}
          place={data.place}
          disabled={busy}
        />

        <hr className="m-divider" />
        <section className="m-section" aria-labelledby="sm04-publish">
          <SectionTitle variant="manage" id="sm04-publish">
            公開
          </SectionTitle>
          <div className="sm04-state">
            <Badge
              tone={published ? "accent" : unpublished ? "muted" : "neutral"}
            >
              {publicationLabel(data.publication)}
            </Badge>
            {data.suspended ? (
              <Badge tone="alert">運営による非公開</Badge>
            ) : null}
            <span className="sm04-state__text">
              {viewable
                ? "保存した内容は、閲覧者への表示にすぐ反映します。"
                : "閲覧者には表示されていません。"}
            </span>
          </div>
          {viewable ? (
            <div className="sm04-links">
              <TextLink to={listingPagePath(data.id)}>
                閲覧者に見える掲載ページ
              </TextLink>
              <TextLink to={placePagePath(data.place.id)}>店舗ページ</TextLink>
            </div>
          ) : null}
          {data.suspended ? null : published ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirming("unpublish")}
            >
              一時非公開にする
            </Button>
          ) : (
            <Button variant="secondary" disabled={busy} onClick={publish}>
              {unpublished ? "確認せずに再公開する" : "確認せずに公開する"}
            </Button>
          )}
          {dirty && !published && !data.suspended ? (
            <p className="m-field__help">
              保存していない変更は、保存してから公開します。
            </p>
          ) : null}
        </section>

        <section className="m-section" aria-labelledby="sm04-offering">
          <SectionTitle variant="manage" id="sm04-offering">
            提供状態
          </SectionTitle>
          <div className="sm04-state">
            <Badge
              tone={
                status.phase === "ended"
                  ? "muted"
                  : status.phase === "available"
                    ? "accent"
                    : "neutral"
              }
            >
              {offeringPhaseLabel(status)}
            </Badge>
            <span className="sm04-state__text">
              {offeringStatusText(data.offering, status)}
            </span>
          </div>
          {status.phase === "ended" && status.cause === "manual" ? (
            <>
              {status.scheduleElapsed ? (
                <p className="m-field__help">
                  提供中に戻しても、終了日または最後の開催日を過ぎているため提供終了のままです。提供期間・開催日を変更してください。
                </p>
              ) : null}
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => transition("resumeOffering")}
              >
                提供中に戻す
              </Button>
            </>
          ) : status.phase === "ended" ? (
            <p className="m-field__help">
              提供期間の終了日を更新するか外す、または開催日を追加して保存すると、提供中に戻ります。
            </p>
          ) : published ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirming("endOffering")}
            >
              提供を終了する
            </Button>
          ) : (
            <p className="m-field__help">
              提供を終了する操作は、公開中の掲載に示します。
            </p>
          )}
        </section>

        <hr className="m-divider" />
        <section className="m-section" aria-labelledby="sm04-more">
          <SectionTitle variant="manage" id="sm04-more">
            この掲載
          </SectionTitle>
          <Button variant="secondary" disabled={busy} onClick={duplicate}>
            複製して新しい下書きをつくる
          </Button>
          <p className="m-field__help">
            名称・紹介文・カテゴリー・写真を引き継ぎます。提供期間と開催日は引き継ぎません。
          </p>
          <Button
            variant="secondary"
            className="sm04-danger"
            disabled={busy}
            onClick={() => setConfirming("delete")}
          >
            この掲載を削除
          </Button>
        </section>
      </form>

      <ConfirmDialog
        open={confirming === "unpublish"}
        title="一時非公開にしますか"
        confirmLabel="一時非公開にする"
        pending={busy}
        onConfirm={() => transition("unpublish")}
        onCancel={() => setConfirming(null)}
      >
        <p>確定すると、すぐに閲覧者への表示が変わります。</p>
        <ul>
          <li>{`${name}は、フィード・地図・検索・店舗ページに表示されなくなります`}</li>
          <li>保存している閲覧者には、閲覧できない掲載として示されます</li>
          <li>参加中のイベントでも、表示されなくなります</li>
          <li>再公開すると、また表示されます</li>
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === "endOffering"}
        title="提供を終了しますか"
        confirmLabel="提供を終了する"
        pending={busy}
        onConfirm={() => transition("endOffering")}
        onCancel={() => setConfirming(null)}
      >
        <p>確定すると、すぐに閲覧者への表示が変わります。</p>
        <ul>
          <li>{`${name}は、提供終了として表示されます`}</li>
          <li>フィードと地図の対象から外れます</li>
          <li>あとから提供中に戻せます</li>
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === "delete"}
        title="この掲載を削除しますか"
        confirmLabel="削除する"
        pending={busy}
        onConfirm={remove}
        onCancel={() => setConfirming(null)}
      >
        <p>削除した掲載は、元に戻せません。</p>
        <ul>
          <li>{`${name}は、閲覧者に表示されなくなります`}</li>
          <li>
            イベントの参加に添えていた場合は、イベントページに表示されなくなります。参加内容には削除された掲載として残り、参加内容の編集で外せます
          </li>
        </ul>
      </ConfirmDialog>
    </ShopPage>
  );
}
