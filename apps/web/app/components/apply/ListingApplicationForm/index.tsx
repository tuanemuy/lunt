"use client";

import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState, useTransition } from "react";
import { DetailPhotos } from "@/components/detail/DetailPhotos";
import { ListingCardBody } from "@/components/detail/ListingCard";
import { ListingHeroText } from "@/components/detail/ListingHero";
import {
  ManageBody,
  ManagePage,
  ManageSection,
} from "@/components/layout/ManageShell";
import { ListingFormFields } from "@/components/listing/ListingFormFields";
import { Button, ButtonLink } from "@/components/ui/Button";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { Photo } from "@/components/ui/Photo";
import { TextButton } from "@/components/ui/TextButton";
import {
  type EligibilityTarget,
  listActiveCategoriesFn,
  previewListingSubmissionFn,
  resubmitApplicationFn,
  submitListingRevisionFn,
  submitNewListingFn,
} from "@/presentation/apply";
import {
  APPLICATION_ID_CONFLICT,
  INPUT_ERROR,
  listingChangedFields,
  listingMissing,
  NO_CHANGE_ERROR,
  offeringDraftText,
  offeringInputError,
  replyError,
  replyOf,
} from "@/presentation/applyForm";
import {
  type ApplyRefusal,
  applicationPath,
  type ListingRevisionFormData,
  type NewListingFormData,
} from "@/presentation/applyView";
import type { ListingPreviewViews } from "@/presentation/detailView";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import {
  LISTING_FIELD_ANCHOR,
  LISTING_FIELD_LABEL,
  LISTING_FIELDS,
  type ListingField,
  type ListingFieldErrors,
  type ListingFormValues,
  listingFieldErrors,
  REPICK_CODES,
  toListingContent,
} from "@/presentation/listingForm";
import type { CategoryOption } from "@/presentation/listingView";
import { newId } from "@/presentation/newId";
import { useReconcile } from "@/presentation/reconcile";
import { KeepOutcome } from "../ApplyOutcome";
import {
  ApplyRefused,
  ApplyTitle,
  ChangedNote,
  Compared,
  type FieldLink,
  ModeNotice,
  ReplyField,
  ReviewList,
  ReviewPhotos,
  refusalAfter,
  type SubmitFailure,
  SubmitFailureAlert,
  useScrollTopOn,
} from "../ApplyParts";
import { ApplySkeleton } from "../ApplySkeleton";
import { useListingStep } from "../ListingStep";

/** RQ-04's two openings: a new listing of a place, or a listing's revision. */
export type ListingApplyData =
  | Readonly<{ kind: "new"; data: NewListingFormData }>
  | Readonly<{ kind: "revision"; data: ListingRevisionFormData }>;

type Errors = Readonly<{ listing: ListingFieldErrors; reply?: string }>;

const NO_ERRORS: Errors = { listing: {} };

function fieldLinks(errors: Errors): readonly FieldLink[] {
  return [
    ...LISTING_FIELDS.filter(
      (field) => errors.listing[field] !== undefined,
    ).map((field) => ({
      anchor: LISTING_FIELD_ANCHOR[field],
      label: LISTING_FIELD_LABEL[field],
    })),
    ...(errors.reply === undefined
      ? []
      : [{ anchor: "apply-reply", label: "追加の確認への回答" }]),
  ];
}

type Preview =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; views: ListingPreviewViews }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "failed"; state: ErrorState }>;

const categoryName = (
  categories: readonly CategoryOption[],
  id: string,
  fallback: string | null = null,
): string =>
  categories.find((category) => category.id === id)?.name ?? fallback ?? "なし";

/**
 * CM-03 from RQ-04 (`?step=preview`): the content being entered as
 * viewers would see it — the detail and the list card — without any
 * publish operation. Back to the form keeps the input.
 */
function PreviewStep({
  preview,
  heading,
  onBack,
  onRetry,
}: {
  preview: Preview;
  heading: string;
  onBack: () => void;
  onRetry: () => void;
}) {
  const back = <Button onClick={onBack}>申請の入力に戻る</Button>;
  if (preview.kind === "loading") {
    return (
      <ManagePage title={<ApplyTitle heading={heading} />} actions={back}>
        <ApplySkeleton variant="preview" label="見え方を読み込んでいます" />
      </ManagePage>
    );
  }
  return (
    <ManagePage title={<ApplyTitle heading={heading} />} actions={back}>
      <ManageBody>
        {preview.kind === "missing" ? (
          <FocusOnMount role="alert">
            <EmptyPanel title="申請の対象のお店が表示できません">
              お店が表示できないため、見え方を示せません。
            </EmptyPanel>
          </FocusOnMount>
        ) : preview.kind === "failed" ? (
          <FocusOnMount role="alert">
            <EmptyPanel
              title="見え方を読み込めませんでした"
              actions={
                <Button variant="secondary" onClick={onRetry}>
                  もう一度読み込む
                </Button>
              }
            >
              {preview.state.kind === "invalidInput"
                ? `${preview.state.message}。申請の入力に戻って直してください。`
                : "通信を確かめて、もう一度読み込んでください。入力した内容は残っています。"}
            </EmptyPanel>
          </FocusOnMount>
        ) : (
          <FocusOnMount>
            <div className="rq-stack">
              <Notice
                variant="manage"
                tone="paper"
                title="申請の入力中の内容です"
              >
                承認されると、このように表示されます。提出は、掲載の申請の画面で行います。
              </Notice>
              <p className="cm03-meta">見る人には、このように表示されます。</p>
              <p className="cm03-label">掲載詳細</p>
              <div className="detail cm03-detail">
                {preview.views.hero.photos.length === 0 ? (
                  <p className="cm03-missing">写真が登録されていません</p>
                ) : (
                  <DetailPhotos photos={preview.views.hero.photos} />
                )}
                <ListingHeroText hero={preview.views.hero} nameAs="p" />
              </div>
              <p className="cm03-label">一覧のカード</p>
              <div className="card-grid cm03-cards">
                <article className="card">
                  <div className="card__link">
                    <ListingCardBody item={preview.views.card} />
                  </div>
                </article>
              </div>
            </div>
          </FocusOnMount>
        )}
      </ManageBody>
    </ManagePage>
  );
}

/**
 * RQ-04 掲載の申請 (LST-12, LST-13, APP-02, APP-04): a new listing of a
 * place without a steward (photos with framing, name, active category,
 * description, offering — the publish condition met), or a published
 * listing's revision (only what differs is applied for). The preview
 * (CM-03 without publishing) is a step of this screen, so coming back
 * keeps the input. A category retired before the submission keeps the
 * input and asks for another (CS-08). Approval gives the applicant no
 * management of the listing.
 */
export function ListingApplicationForm({ apply }: { apply: ListingApplyData }) {
  const router = useRouter();
  const reconcile = useReconcile();
  const { step, openPreview, closePreview } = useListingStep();
  const { data } = apply;
  const { mode, place } = data;
  const revision = apply.kind === "revision" ? apply.data : null;
  const resubmit = mode.kind === "resubmit" ? mode : null;
  const [values, setValues] = useState<ListingFormValues>(data.start);
  const [categories, setCategories] = useState(data.categories);
  const [reply, setReply] = useState("");
  const [stage, setStage] = useState<"input" | "review">("input");
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const [refusal, setRefusal] = useState<ApplyRefusal | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>({ kind: "loading" });
  const [sending, startSend] = useTransition();
  useScrollTopOn(
    `${stage}:${step}:${preview.kind}:${done === null}:${refusal === null}`,
  );
  const [, startPreview] = useTransition();
  const attemptId = useRef<string | null>(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const changed =
    revision === null ? [] : listingChangedFields(revision.current, values);
  const dirty =
    JSON.stringify(values) !== JSON.stringify(data.start) || reply !== "";
  const target: EligibilityTarget =
    revision === null
      ? { kind: "listing", placeId: place.placeId }
      : { kind: "listingRevision", listingId: revision.listing.listingId };

  const loadPreview = () =>
    startPreview(async () => {
      setPreview({ kind: "loading" });
      try {
        const views = await previewListingSubmissionFn({
          data: {
            placeId: place.placeId,
            content: toListingContent(valuesRef.current),
          },
        });
        setPreview({ kind: "ready", views });
      } catch (error) {
        const state = classifyError(error);
        setPreview(
          state.kind === "notFound"
            ? { kind: "missing" }
            : { kind: "failed", state },
        );
      }
    });

  // Entering the step (the button, Back/Forward, or a reload) reads the
  // preview of what the form holds at that moment.
  // biome-ignore lint/correctness/useExhaustiveDependencies: read once per entry into the step
  useEffect(() => {
    if (step === "preview") loadPreview();
  }, [step]);

  const fail = (failed: ErrorState, next: Errors) => {
    setErrors(next);
    setFailure({ kind: "error", state: failed, fields: fieldLinks(next) });
    setStage("input");
  };

  const check = () => {
    const missing = listingMissing(values);
    const offering = offeringInputError(values.offering);
    if (Object.keys(missing).length > 0) {
      fail(INPUT_ERROR, {
        listing:
          offering === null
            ? missing
            : { ...missing, offering: offering.message },
      });
      return;
    }
    if (offering !== null) {
      fail(offering, { listing: { offering: offering.message } });
      return;
    }
    if (revision !== null && changed.length === 0) {
      fail(NO_CHANGE_ERROR, NO_ERRORS);
      return;
    }
    setErrors(NO_ERRORS);
    setFailure(null);
    if (resubmit === null) setStage("review");
    else send();
  };

  const send = () =>
    startSend(async () => {
      const content = toListingContent(values);
      try {
        if (resubmit !== null) {
          const result = await resubmitApplicationFn({
            data: {
              applicationId: resubmit.applicationId,
              version: resubmit.version,
              amended:
                revision === null
                  ? { kind: "listing", content }
                  : { kind: "listingRevision", content },
              reply: replyOf(reply),
            },
          });
          if (result.outcome === "lapsed") {
            setFailure({
              kind: "lapsed",
              applicationId: resubmit.applicationId,
              brokenPremises: result.brokenPremises,
            });
            return;
          }
          router.clearCache();
          setDone(resubmit.applicationId);
          return;
        }
        attemptId.current ??= newId();
        const { applicationId } =
          revision === null
            ? await submitNewListingFn({
                data: {
                  applicationId: attemptId.current,
                  placeId: place.placeId,
                  content,
                },
              })
            : await submitListingRevisionFn({
                data: {
                  applicationId: attemptId.current,
                  listingId: revision.listing.listingId,
                  content,
                },
              });
        attemptId.current = null;
        // Not reloaded here: its eligibility may now refuse the screen.
        router.clearCache();
        setDone(applicationId);
      } catch (error) {
        const failed = classifyError(error);
        if (
          failed.kind === "conflict" &&
          failed.code === APPLICATION_ID_CONFLICT
        ) {
          setStage("input");
          setFailure({ kind: "taken", applicationId: attemptId.current ?? "" });
          return;
        }
        if (resubmit === null) {
          const refused = await refusalAfter(failed, target);
          if (refused !== null) {
            setRefusal(refused);
            return;
          }
        }
        const reason = replyError(failed);
        const listing = listingFieldErrors(failed);
        const repick =
          failed.kind === "premiseChanged" &&
          failed.code !== null &&
          REPICK_CODES[failed.code] !== undefined;
        const retired = categoryName(categories, values.categoryId, "");
        fail(
          repick && retired !== ""
            ? {
                ...failed,
                message: `選んだカテゴリー「${retired}」は、${resubmit === null ? "提出" : "再提出"}までに廃止されました。現役のカテゴリーから選び直してください`,
              }
            : failed,
          { listing, ...(reason === undefined ? {} : { reply: reason }) },
        );
        if (repick) {
          // CS-08 for a retired category: keep the input, clear the retired
          // choice and offer the active categories to pick from again.
          setValues((current) => ({ ...current, categoryId: "" }));
          try {
            setCategories(await listActiveCategoriesFn());
          } catch {
            // The list read with the page stays; the alert still asks to re-pick.
          }
        }
      }
    });

  const heading =
    resubmit !== null
      ? revision === null
        ? "掲載の申請を再提出"
        : "掲載の修正の申請を再提出"
      : revision === null
        ? "掲載を申請"
        : "掲載の修正を申請";

  if (refusal !== null) {
    return (
      <KeepOutcome
        view={
          <ApplyRefused
            heading={heading}
            refusal={refusal}
            what={revision === null ? "listing" : "listingRevision"}
          />
        }
      />
    );
  }

  if (step === "preview" && done === null) {
    return (
      <PreviewStep
        preview={preview}
        heading="公開前プレビュー"
        onBack={closePreview}
        onRetry={loadPreview}
      />
    );
  }

  const title = <ApplyTitle heading={heading} />;
  const name = values.name;

  if (done !== null) {
    return (
      <KeepOutcome
        view={
          <ManagePage title={title}>
            <FocusOnMount>
              <DonePanel
                title={
                  resubmit === null
                    ? "申請を提出しました"
                    : "申請を再提出しました"
                }
                actions={
                  <>
                    <ButtonLink to={applicationPath(done)}>
                      申請の詳細を見る
                    </ButtonLink>
                    {revision === null ? (
                      <ButtonLink
                        variant="secondary"
                        to="/places/$placeId"
                        params={{ placeId: place.placeId }}
                      >
                        店舗ページへ戻る
                      </ButtonLink>
                    ) : (
                      <ButtonLink
                        variant="secondary"
                        to="/listings/$listingId"
                        params={{ listingId: revision.listing.listingId }}
                      >
                        掲載詳細へ戻る
                      </ButtonLink>
                    )}
                  </>
                }
              >
                {`${place.name}への「${name}」の${revision === null ? "掲載" : "掲載の修正"}の申請は、確認中${resubmit === null ? "になりました" : "に戻りました"}。サービス運営者が確かめて、結果を通知します。承認されても、申請したあなたは掲載の管理権限を得ません。`}
              </DonePanel>
            </FocusOnMount>
          </ManagePage>
        }
      />
    );
  }

  const approvedNotice = (
    <Notice variant="manage" tone="paper" title="承認されたあとの掲載">
      {revision === null
        ? `承認されると、掲載は${place.name}の掲載として公開されます。申請したあなたは、この掲載の管理権限を得ません。`
        : "承認の時点の掲載の内容に、この変更を重ねて反映します。申請したあなたは、この掲載の管理権限を得ません。"}
    </Notice>
  );

  const currentCategory =
    revision === null
      ? ""
      : categoryName(
          categories,
          revision.current.categoryId,
          revision.currentCategoryName,
        );

  const currentText = (field: ListingField): string => {
    if (revision === null) return "";
    const current = revision.current;
    switch (field) {
      case "photos":
        return `${current.photos.length}枚`;
      case "name":
        return current.name;
      case "category":
        return currentCategory;
      case "description":
        return current.description.trim() === "" ? "なし" : current.description;
      case "offering":
        return offeringDraftText(current.offering);
    }
  };

  if (stage === "review") {
    const proposed = (field: ListingField) => {
      switch (field) {
        case "photos":
          return <ReviewPhotos photos={values.photos} />;
        case "name":
          return values.name;
        case "category":
          return categoryName(categories, values.categoryId);
        case "description":
          return values.description.trim() === "" ? "なし" : values.description;
        case "offering":
          return offeringDraftText(values.offering);
      }
    };
    const items =
      revision === null
        ? [
            {
              term: "申請の種類",
              value: "管理者のいない店舗の掲載（新しい掲載）",
            },
            { term: "申請の対象", value: place.name },
            ...LISTING_FIELDS.map((field) => ({
              term: LISTING_FIELD_LABEL[field],
              value: proposed(field),
            })),
          ]
        : [
            { term: "申請の種類", value: "掲載の修正" },
            {
              term: "申請の対象",
              value: `${revision.listing.name}（${place.name}）`,
            },
            ...changed.map((field) => ({
              term: LISTING_FIELD_LABEL[field],
              value: (
                <Compared
                  current={
                    field === "photos" ? (
                      <ReviewPhotos photos={revision.current.photos} />
                    ) : (
                      currentText(field)
                    )
                  }
                  proposed={proposed(field)}
                />
              ),
            })),
          ];
    return (
      <ManagePage
        title={title}
        actions={
          <>
            <Button disabled={sending} onClick={send}>
              {sending ? "提出しています…" : "提出する"}
            </Button>
            <Button
              variant="secondary"
              disabled={sending}
              onClick={() => setStage("input")}
            >
              入力に戻る
            </Button>
          </>
        }
      >
        <FocusOnMount>
          <ManageBody>
            <p className="rq-lead">
              {revision === null
                ? "次の内容で、掲載の申請を提出します。提出すると申請は確認中になり、提出の後はこの画面で直せません。"
                : "次の変更で、掲載の修正を申請します。変更しない項目は示していません。"}
            </p>
            <ReviewList items={items} />
            {approvedNotice}
            <TextButton onClick={openPreview}>
              {revision === null
                ? "閲覧者への見え方を確かめる"
                : "修正後の見え方を確かめる"}
            </TextButton>
          </ManageBody>
        </FocusOnMount>
      </ManagePage>
    );
  }

  const note = (field: ListingField) =>
    revision !== null && changed.includes(field) ? (
      <ChangedNote current={currentText(field)} />
    ) : null;

  const cover =
    revision === null ? place.cover : (revision.listing.cover ?? place.cover);

  return (
    <ManagePage
      title={title}
      actions={
        <>
          <Button
            type="submit"
            form="listing-apply-form"
            disabled={sending || failure?.kind === "lapsed"}
          >
            {resubmit === null
              ? "入力内容を確かめる"
              : sending
                ? "再提出しています…"
                : "この内容で再提出する"}
          </Button>
          {resubmit !== null ? (
            <ButtonLink
              variant="secondary"
              to={applicationPath(resubmit.applicationId)}
            >
              申請の詳細に戻る
            </ButtonLink>
          ) : revision === null ? (
            <ButtonLink
              variant="secondary"
              to="/places/$placeId"
              params={{ placeId: place.placeId }}
            >
              やめる
            </ButtonLink>
          ) : (
            <ButtonLink
              variant="secondary"
              to="/listings/$listingId"
              params={{ listingId: revision.listing.listingId }}
            >
              やめる
            </ButtonLink>
          )}
        </>
      }
      {...(resubmit !== null
        ? {
            actionsNote: dirty
              ? "再提出していない変更があります。再提出せずに画面を離れると、変更は残らず、申請は差し戻しのまま変わりません。"
              : "再提出せずにやめると、申請は差し戻しのまま変わりません。",
          }
        : dirty
          ? {
              actionsNote:
                "提出していない入力があります。提出せずに画面を離れると、申請は作られず、入力した内容は残りません。",
            }
          : {})}
    >
      <form
        className="m-body"
        id="listing-apply-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          check();
        }}
      >
        {failure === null ? null : (
          <SubmitFailureAlert
            failure={failure}
            resubmit={resubmit !== null}
            applicationId={resubmit?.applicationId ?? null}
            busy={sending}
            lead="写真・名称・カテゴリーは、掲載を公開するための条件です。次の項目を直してください。"
            onReload={() =>
              startSend(async () => {
                setFailure(null);
                await reconcile();
              })
            }
            retry={
              <Button variant="secondary" disabled={sending} onClick={send}>
                もう一度提出
              </Button>
            }
          />
        )}
        <ModeNotice
          mode={mode}
          reapplied={
            revision === null
              ? "内容（写真を含む）"
              : "変更した項目（写真を含む）を、掲載の現在の内容に重ねた内容"
          }
        />
        <div className="m-field">
          <p className="m-field__label">申請の対象</p>
          <div className="m-row">
            <Photo
              photo={cover === null ? null : { src: cover.url, framing: null }}
              alt=""
              ratio={1}
              className="m-row__photo"
              emptyLabel="写真なし"
            />
            <span className="m-row__content">
              {revision === null ? (
                <>
                  <span className="m-row__name">{place.name}</span>
                  <span className="m-row__meta">新しい掲載</span>
                  <span className="m-row__sub">
                    {place.address === ""
                      ? "管理者のいない店舗"
                      : `管理者のいない店舗 · ${place.address}`}
                  </span>
                </>
              ) : (
                <>
                  <span className="m-row__name">{revision.listing.name}</span>
                  <span className="m-row__meta">{`掲載の修正 · ${place.name}`}</span>
                </>
              )}
            </span>
          </div>
          <p className="m-field__help">
            {revision === null
              ? "店舗に管理者がいないため、個人として申請します。サービス運営者が確かめて、承認されると店舗の掲載として公開されます。"
              : "掲載の現在の内容が入っています。直したい項目だけを変えます。変えた項目には「変更」と、現在の値を示します。"}
          </p>
        </div>
        <ListingFormFields
          values={values}
          onChange={(change) =>
            setValues((current) => ({ ...current, ...change }))
          }
          errors={errors.listing}
          categories={categories}
          place={{
            id: place.placeId,
            name: place.name,
            address: place.address,
          }}
          disabled={sending}
          requirement="required"
          target={null}
          notes={{
            photos: note("photos"),
            name: note("name"),
            category: note("category"),
            description: note("description"),
            offering: note("offering"),
          }}
        />
        {resubmit === null ? null : (
          <ReplyField
            value={reply}
            onChange={setReply}
            disabled={sending}
            {...(errors.reply === undefined ? {} : { error: errors.reply })}
          />
        )}
        <hr className="m-divider" />
        <ManageSection id="rq04-preview" title="閲覧者への見え方">
          <p className="m-field__help">
            入力中の内容で、一覧のカードと掲載の詳細での見え方を確かめられます。戻ると、入力した内容は残っています。価格とキャッチコピーは、掲載に表示されません。
          </p>
          <Button variant="secondary" onClick={openPreview}>
            閲覧者への見え方を確かめる
          </Button>
        </ManageSection>
      </form>
    </ManagePage>
  );
}
