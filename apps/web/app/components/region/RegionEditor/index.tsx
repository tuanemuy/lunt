"use client";

import { useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState, useTransition } from "react";
import { ManageBody, ManagePage } from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { HydrationGate } from "@/components/ui/HydrationGate";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import { SectionTitle } from "@/components/ui/SectionTitle";
import {
  conflictedDraft,
  followDraft,
  isDirty,
  reloadDraft,
  savedDraft,
  settledDraft,
  useEditDraft,
} from "@/presentation/editDraft";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { photosTakenMeanwhile } from "@/presentation/photoTakedown";
import { publishSaveFailure } from "@/presentation/publishPremise";
import { useReconcile } from "@/presentation/reconcile";
import {
  changeRegionPublicationFn,
  loadRegionFrameFn,
  updateRegionContentFn,
} from "@/presentation/region";
import {
  missingRequirements,
  REGION_FIELD_ANCHOR,
  REGION_FIELD_LABEL,
  REGION_FIELDS,
  type RegionFieldErrors,
  regionFieldErrors,
  regionFormValuesOf,
  toRegionContent,
} from "@/presentation/regionForm";
import {
  type RegionEditorData,
  regionMembersPath,
  regionNameText,
  regionPagePath,
  regionPublicationLabel,
} from "@/presentation/regionView";
import { RegionFormFields } from "../RegionFormFields";
import { RegionPage } from "../RegionShell";
import { useRegionFrame } from "../RegionShell/useRegionFrame";

const HEADING = "地域情報を編集";

type Attempt = "save" | "publish" | "unpublish";

type Failure = Readonly<{
  state: ErrorState;
  fields: RegionFieldErrors;
  attempt: Attempt;
}>;

type Outcome =
  | Readonly<{ kind: "saved" }>
  | Readonly<{ kind: "published" }>
  | Readonly<{ kind: "unpublished" }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "lostAccess" }>
  | Readonly<{ kind: "lostProxy"; attempt: Attempt }>;

const LOST_PROXY_NOT_APPLIED: Readonly<Record<Attempt, string>> = {
  save: "変更は保存していません。",
  publish: "公開していません。",
  unpublish: "公開を取り下げていません。",
};

const INPUT_CHECK: ErrorState = {
  kind: "invalidInput",
  code: null,
  message: "入力内容を確かめてください",
  fieldErrors: {},
  missing: [],
};

function FieldLinks({ fields }: { fields: RegionFieldErrors }) {
  return REGION_FIELDS.filter((field) => fields[field] !== undefined).map(
    (field) => (
      <li key={field}>
        <a className="text-button" href={`#${REGION_FIELD_ANCHOR[field]}`}>
          {REGION_FIELD_LABEL[field]}
        </a>
      </li>
    ),
  );
}

/**
 * The alert above RM-02's form after a failed save, publish or
 * unpublish: CS-07, CS-08, CS-10 (the fields to fix, the unmet publish
 * requirements) and CS-02. Each new failure takes the focus, which also
 * scrolls it into view from the dock's buttons.
 */
function FailureAlert({
  failure,
  publicationText,
  photosTakenMeanwhile,
  busy,
  onReload,
  onRetry,
}: {
  failure: Failure;
  publicationText: string;
  /** A claim removed photos the form started from: the cause of a CS-07. */
  photosTakenMeanwhile: boolean;
  busy: boolean;
  onReload: () => void;
  onRetry: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const { state, attempt, fields } = failure;
  const body = (() => {
    if (state.kind === "conflict") {
      return (
        <Alert
          title={
            photosTakenMeanwhile
              ? "申立てにより、写真が削除されていました"
              : "ほかの運営者が先に地域情報を保存していました"
          }
          actions={
            <Button variant="secondary" disabled={busy} onClick={onReload}>
              最新の内容を読み直す
            </Button>
          }
        >
          {photosTakenMeanwhile
            ? "編集している間に、サービス運営者が申立てに基づいてこの地域の写真を削除しました。この変更は保存していません。最新の内容を読み直してから、もう一度変更してください。"
            : "この変更は保存していません。最新の内容を読み直してから、もう一度変更してください。"}
        </Alert>
      );
    }
    if (state.kind === "premiseChanged") {
      return (
        <Alert
          title={
            attempt === "unpublish"
              ? "公開を取り下げられませんでした"
              : attempt === "publish"
                ? "公開できませんでした"
                : "保存できませんでした"
          }
        >
          {`${state.message}。現在の公開状態は「${publicationText}」です。`}
        </Alert>
      );
    }
    if (state.kind === "invalidInput") {
      const unmet = missingRequirements(state).length > 0;
      return (
        <Alert
          title={
            unmet && attempt === "publish"
              ? "公開できませんでした"
              : "保存できませんでした"
          }
          list={<FieldLinks fields={fields} />}
        >
          {unmet
            ? attempt === "publish"
              ? "地域の公開には、名称・所在地・位置・写真が必要です。次の項目を補ってください。保存した内容は、公開していない状態のまま残っています。"
              : "公開中の地域は、名称・所在地・位置・写真の公開の条件を満たす内容だけを保存できます。次の項目を直すか、先に公開を取り下げてから保存してください。"
            : Object.keys(fields).length === 0
              ? state.message
              : "次の項目を直してください。"}
        </Alert>
      );
    }
    return (
      <Alert
        title={
          attempt === "save"
            ? "保存できませんでした"
            : attempt === "publish"
              ? "公開できませんでした"
              : "公開を取り下げられませんでした"
        }
        {...(state.kind === "failed"
          ? {
              actions: (
                <Button variant="secondary" disabled={busy} onClick={onRetry}>
                  {attempt === "save"
                    ? "もう一度保存"
                    : attempt === "publish"
                      ? "もう一度公開"
                      : "もう一度取り下げる"}
                </Button>
              ),
            }
          : {})}
      >
        {state.kind === "failed"
          ? "通信を確かめて、もう一度お試しください。入力した内容は残っています。"
          : state.message}
      </Alert>
    );
  })();
  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      {body}
    </div>
  );
}

/**
 * RM-02 地域情報の編集 (REG-06, REG-07, REG-12, REG-13, MOD-03): the whole
 * content saved at once, and the publication changed (CF-08: publish,
 * 公開の取り下げ after CS-12). The region steward, or an operator standing
 * in (CS-14). While suspended the publication cannot change; saving goes on.
 */
export function RegionEditor({ data }: { data: RegionEditorData }) {
  const frame = useRegionFrame();
  const router = useRouter();
  const reconcile = useReconcile();
  const created = useSearch({
    strict: false,
    select: (search) => search.created === true,
  });
  const proxy = frame.basis === "proxy";
  const [draft, setDraft] = useEditDraft(data, regionFormValuesOf);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const { values } = draft;
  const dirty = isDirty(draft);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showCreated, setShowCreated] = useState(created);
  const [busy, startBusy] = useTransition();

  const name = regionNameText(data.name === "" ? null : data.name);
  const { publication, suspended } = data;
  const published = publication.status === "published";
  const photoTakedown =
    publication.status === "unpublished" &&
    publication.reason === "photoTakedown";

  const begin = () => {
    setFailure(null);
    setOutcome(null);
    setShowCreated(false);
    setDraft(settledDraft);
  };

  const fail = async (error: unknown, attempt: Attempt, savedFirst = false) => {
    const state = classifyError(error);
    if (state.kind === "notFound") {
      setOutcome({ kind: "missing" });
      return;
    }
    if (state.kind === "forbidden") {
      setOutcome(
        proxy ? { kind: "lostProxy", attempt } : { kind: "lostAccess" },
      );
      router.clearCache();
      return;
    }
    if (state.kind === "premiseChanged" || savedFirst) {
      if (!savedFirst) setDraft(followDraft);
      await reconcile();
    } else if (state.kind === "conflict") {
      // The edits and their version stay until 最新の内容を読み直す; the fresh
      // copy tells a claim's takedown (CS-16) from another operator's save.
      setDraft(conflictedDraft);
      await reconcile();
    }
    // Set after the reconcile and inside the transition (a set after an
    // await is not), so CS-08's 「現在の公開状態」 and the state line land in
    // the commit that shows the region as it is now, never the stale copy.
    const next: Failure = { state, fields: regionFieldErrors(state), attempt };
    startBusy(() => setFailure(next));
  };

  /** Saves the form as it is; the reply's version is the one the next save sends. */
  const saveValues = async (): Promise<boolean> => {
    const { values: submitted, version } = draftRef.current;
    const built = toRegionContent(submitted);
    if (!built.ok) {
      setFailure({ state: INPUT_CHECK, fields: built.errors, attempt: "save" });
      return false;
    }
    const saved = await updateRegionContentFn({
      data: { regionId: data.regionId, version, content: built.content },
    });
    setDraft((current) => savedDraft(current, submitted, saved.version));
    return true;
  };

  const save = () =>
    startBusy(async () => {
      begin();
      try {
        if (!(await saveValues())) return;
        await reconcile();
        startBusy(() => setOutcome({ kind: "saved" }));
      } catch (error) {
        await fail(error, "save");
      }
    });

  const publish = () =>
    startBusy(async () => {
      begin();
      let savedFirst = false;
      try {
        if (isDirty(draftRef.current)) {
          const saved = await saveValues().catch(async (error: unknown) => {
            throw await publishSaveFailure(error, "REGION", async () => {
              const frame = await loadRegionFrameFn({
                data: { regionId: data.regionId },
              });
              return {
                published: frame.publication.status === "published",
                suspended: frame.suspended,
              };
            });
          });
          if (!saved) return;
          savedFirst = true;
        }
        await changeRegionPublicationFn({
          data: { regionId: data.regionId, change: "publish" },
        });
        await reconcile();
        startBusy(() => setOutcome({ kind: "published" }));
      } catch (error) {
        await fail(error, "publish", savedFirst);
      }
    });

  const unpublish = () =>
    startBusy(async () => {
      setConfirming(false);
      begin();
      try {
        await changeRegionPublicationFn({
          data: { regionId: data.regionId, change: "unpublish" },
        });
        await reconcile();
        startBusy(() => setOutcome({ kind: "unpublished" }));
      } catch (error) {
        await fail(error, "unpublish");
      }
    });

  const retry = (attempt: Attempt) =>
    attempt === "save"
      ? save()
      : attempt === "publish"
        ? publish()
        : unpublish();

  if (outcome?.kind === "missing" || outcome?.kind === "lostAccess") {
    return (
      <RegionPage frame={frame} heading={HEADING}>
        <ManageBody>
          <FocusOnMount role="alert">
            {outcome.kind === "missing" ? (
              <EmptyPanel
                title="この地域は見つかりません"
                actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
              >
                地域が削除されたか、存在しない地域です。変更は保存していません。
              </EmptyPanel>
            ) : (
              <EmptyPanel
                title="この地域の地域運営者ではありません"
                actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
              >
                地域の管理権限がなくなったため、変更は保存していません。
              </EmptyPanel>
            )}
          </FocusOnMount>
        </ManageBody>
      </RegionPage>
    );
  }

  if (outcome?.kind === "lostProxy") {
    return (
      <ManagePage title={null}>
        <ManageBody>
          <FocusOnMount role="alert">
            <EmptyPanel
              title="この地域は代行できません"
              headingLevel="h1"
              actions={
                <ButtonLink
                  to="/ops/subjects/$kind/$id"
                  params={{ kind: "region", id: data.regionId }}
                >
                  地域の運営へ戻る
                </ButtonLink>
              }
            >
              {`${name}には地域運営者が就きました。不在の代行はできません。${LOST_PROXY_NOT_APPLIED[outcome.attempt]}地域の運営の画面で、運営者がいることを確かめてください。`}
            </EmptyPanel>
          </FocusOnMount>
        </ManageBody>
      </ManagePage>
    );
  }

  if (outcome !== null) {
    const backToEditing = (
      <Button variant="secondary" onClick={() => setOutcome(null)}>
        地域情報の編集に戻る
      </Button>
    );
    const toPage = (
      <ButtonLink to={regionPagePath(data.regionId)}>
        地域ページを見る
      </ButtonLink>
    );
    return (
      <RegionPage frame={frame} heading={HEADING}>
        <FocusOnMount>
          {outcome.kind === "saved" ? (
            <DonePanel
              title="地域情報を保存しました"
              actions={
                <>
                  {data.viewable ? toPage : null}
                  {backToEditing}
                </>
              }
            >
              {data.viewable
                ? "公開中の地域ページに変更を反映しました。"
                : suspended
                  ? "保存しました。地域は運営による非公開のため、閲覧者には表示されていません。"
                  : "保存しました。地域は公開していないため、閲覧者には表示されていません。"}
            </DonePanel>
          ) : outcome.kind === "published" ? (
            <DonePanel
              title={`${name}を公開しました`}
              actions={
                <>
                  {toPage}
                  {backToEditing}
                </>
              }
            >
              地域は、フィード・マップ・まち・検索に表示されます。所属店舗と掲載には、所属地域として示されます。
            </DonePanel>
          ) : (
            <DonePanel
              title="公開を取り下げました"
              actions={
                <Button onClick={() => setOutcome(null)}>
                  地域情報の編集に戻る
                </Button>
              }
            >
              {`${name}は、閲覧者に表示されなくなりました。所属関係とイベントの関連づけは保たれています。`}
            </DonePanel>
          )}
        </FocusOnMount>
      </RegionPage>
    );
  }

  const saveButton = (
    <Button
      key="save"
      type="submit"
      form="region-form"
      variant={published || suspended ? "primary" : "secondary"}
      disabled={busy}
    >
      {busy ? "保存しています…" : "変更を保存"}
    </Button>
  );
  const actions = suspended ? (
    saveButton
  ) : published ? (
    <>
      {saveButton}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        公開を取り下げる
      </Button>
    </>
  ) : (
    <>
      <Button disabled={busy} onClick={publish}>
        公開する
      </Button>
      {saveButton}
    </>
  );

  return (
    <RegionPage
      frame={frame}
      heading={HEADING}
      actions={<HydrationGate>{actions}</HydrationGate>}
      {...(dirty
        ? {
            actionsNote: published
              ? "保存していない変更があります。保存せずに画面を離れると、変更は残りません。"
              : "保存していない変更があります。公開すると、変更を保存してから公開します。保存せずに画面を離れると、変更は残りません。",
          }
        : {})}
    >
      <form
        className="m-body"
        id="region-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <HydrationGate>
          {failure === null ? null : (
            <FailureAlert
              key={`${failure.attempt}:${failure.state.kind}:${failure.state.code}`}
              failure={failure}
              publicationText={regionPublicationLabel(publication)}
              photosTakenMeanwhile={photosTakenMeanwhile(
                data,
                draft.base.photos,
              )}
              busy={busy}
              onReload={() =>
                startBusy(async () => {
                  setDraft(reloadDraft);
                  await reconcile();
                  setFailure(null);
                })
              }
              onRetry={() => retry(failure.attempt)}
            />
          )}
          {showCreated ? (
            <div role="status">
              <Notice
                variant="manage"
                title="地域を下書きとして登録しました"
                actions={
                  <ButtonLink
                    variant="secondary"
                    to="/ops/subjects/$kind/$id"
                    params={{ kind: "region", id: data.regionId }}
                  >
                    地域の運営へ（管理権限の付与）
                  </ButtonLink>
                }
              >
                この画面のまま公開へ進めます。地域は運営者が不在の地域です。管理権限は、地域の運営の画面からメンバーの管理を開いて付与します。
              </Notice>
            </div>
          ) : null}
          {data.photosTakenDown ? (
            <div role="status">
              <Notice
                variant="manage"
                tone="paper"
                title="申立てにより、地域の写真が削除されました"
                actions={
                  <a className="text-button" href="#photos">
                    写真を登録する
                  </a>
                }
              >
                {photoTakedown
                  ? suspended
                    ? "写真がなくなったため、地域は公開を取り下げた状態になりました。写真を登録して保存し、運営による非公開が解除された後に、公開の操作で再び公開してください。"
                    : "写真がなくなったため、地域は公開を取り下げた状態になりました。写真を登録して保存し、公開の操作で再び公開してください。"
                  : `地域は「${regionPublicationLabel(publication)}」のままです。写真を登録して保存すると、この表示は消えます。`}
              </Notice>
            </div>
          ) : null}

          <section className="m-section" aria-labelledby="rm02-state">
            <SectionTitle variant="manage" id="rm02-state">
              公開状態
            </SectionTitle>
            <p className="p-badges">
              {suspended ? <Badge tone="alert">運営による非公開</Badge> : null}
              <Badge
                tone={
                  published
                    ? suspended
                      ? "neutral"
                      : "accent"
                    : publication.status === "unpublished"
                      ? "muted"
                      : "neutral"
                }
              >
                {suspended && published
                  ? "公開"
                  : regionPublicationLabel(publication)}
              </Badge>
            </p>
            <p className="m-field__help">
              {suspended
                ? `サービス運営者が地域を非公開にしています。解除されるまで、地域は閲覧者に表示されません。解除できるのはサービス運営者だけで、解除すると「${regionPublicationLabel(publication)}」に戻ります。その間も、地域情報の保存はこれまでどおり行えます。`
                : published
                  ? "地域は閲覧者に表示されています。保存した内容は、その時点で地域ページに反映します。公開をやめるときは、公開を取り下げます。"
                  : publication.status === "draft"
                    ? "地域は閲覧者に表示されていません。名称・所在地・位置・写真が揃うと公開できます。地域運営者がいなくても公開できます。"
                    : "地域は閲覧者に表示されていません。所属関係とイベントの関連づけは保たれています。公開すると、再び表示されます。"}
            </p>
          </section>

          <RegionFormFields
            values={values}
            onChange={(change) =>
              setDraft((current) => ({
                ...current,
                values: { ...current.values, ...change },
              }))
            }
            errors={failure?.fields ?? {}}
            lists={data.areaLists}
            disabled={busy}
            {...(data.photosTakenDown && values.photos.length === 0
              ? { emptyPhotoText: "写真は削除されました" }
              : {})}
          />

          <hr className="m-divider" />
          <section className="m-section" aria-labelledby="rm02-related">
            <SectionTitle variant="manage" id="rm02-related">
              地域の運営
            </SectionTitle>
            {!data.viewable && proxy ? null : (
              <LinkList>
                {data.viewable ? (
                  <li>
                    <ListRowLink
                      to={regionPagePath(data.regionId)}
                      title="閲覧者に見える地域ページ"
                      meta="保存した内容は、この地域ページにすぐ反映します"
                    />
                  </li>
                ) : null}
                {proxy ? null : (
                  <li>
                    <ListRowLink
                      to={regionMembersPath(data.regionId)}
                      title="メンバーの管理"
                      meta={
                        data.stewardCount === 0
                          ? "地域運営者はいません · 管理権限を付与できます"
                          : `地域運営者 ${data.stewardCount}人`
                      }
                    />
                  </li>
                )}
              </LinkList>
            )}
            <p className="m-field__help">
              所属店舗の情報と掲載は、地域の運営からは変えられません。
            </p>
          </section>
        </HydrationGate>
      </form>

      <ConfirmDialog
        open={confirming}
        title={`${name}の公開を取り下げますか`}
        confirmLabel="公開を取り下げる"
        pending={busy}
        onConfirm={unpublish}
        onCancel={() => setConfirming(false)}
      >
        <p>確定すると、すぐに閲覧者への表示が変わります。</p>
        <ul>
          <li>
            地域は、フィード・マップ・まち・検索・地域ページのどこにも表示されなくなります
          </li>
          <li>所属店舗と掲載にも、所属地域として表示されなくなります</li>
          <li>所属関係とイベントの関連づけは保たれます</li>
          <li>公開の操作で、再び公開できます</li>
        </ul>
      </ConfirmDialog>
    </RegionPage>
  );
}
