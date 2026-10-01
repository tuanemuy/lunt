"use client";

import { useRouter } from "@tanstack/react-router";
import {
  type MouseEvent,
  useCallback,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  CandidateSearch,
  type CandidateSnapshot,
} from "@/components/event/CandidatePicker";
import { ManageBody, ManagePage } from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChipButton, ChipLink } from "@/components/ui/ChipButton";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Fieldset } from "@/components/ui/Field";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { HydrationGate } from "@/components/ui/HydrationGate";
import { Notice } from "@/components/ui/Notice";
import { Row, RowLink } from "@/components/ui/Rows";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TextButton, TextLink } from "@/components/ui/TextButton";
import { resubmitApplicationFn } from "@/presentation/apply";
import {
  APPLICATION_ID_CONFLICT,
  INPUT_ERROR,
  replyError,
  replyOf,
} from "@/presentation/applyForm";
import {
  checkParticipationFn,
  findParticipationOccasionsFn,
  participationChoiceFn,
  participationListingsFn,
  submitParticipationFn,
} from "@/presentation/applyRelations";
import {
  type AttachableOption,
  type CandidateRefusal,
  type ParticipationChoice,
  type ParticipationFormData,
  type PlaceOption,
  type RelationRefusal,
  refusalLinkOf,
  shopEventsPath,
} from "@/presentation/applyRelationsView";
import { applicationPath, shopHomePath } from "@/presentation/applyView";
import { useEntryDraft } from "@/presentation/entryDraft";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import {
  jpDate,
  jpDateWithWeekday,
  offeringPhaseLabel,
} from "@/presentation/listingView";
import { newId } from "@/presentation/newId";
import {
  type AttachedListingItem,
  attachedListingState,
  type PeriodView,
  periodText,
} from "@/presentation/occasionView";
import {
  type ParticipationDraft,
  participationDraftSchema,
} from "@/presentation/participationDraft";
import { useReconcile } from "@/presentation/reconcile";
import { KeepOutcome } from "../ApplyOutcome";
import {
  ApplyTitle,
  type FieldLink,
  ModeNotice,
  ReplyField,
  ReviewList,
  type SubmitFailure,
  SubmitFailureAlert,
  useScrollTopOn,
} from "../ApplyParts";
import { CandidateRadios, RelationRefused } from "../RelationParts";

/** The codes a submission is refused with for a reason of 「受け付けない事情」. */
const REFUSED_CODES: ReadonlySet<string> = new Set([
  "APPLICATION_PLACE_HAS_NO_STEWARD",
  "APPLICATION_OCCASION_NOT_OPEN",
  "APPLICATION_ALREADY_PARTICIPATING",
  "APPLICATION_TARGET_NOT_VIEWABLE",
  "APPLICATION_ALREADY_ACTIVE",
]);

const NOT_ATTACHABLE = "OCCASION_LISTING_NOT_ATTACHABLE";
const OUT_OF_PERIOD = "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD";

/** Periods longer than this are entered by date rather than ticked day by day. */
const TICKED_DAYS_MAX = 62;

type Errors = Readonly<{
  place?: string | undefined;
  occasion?: string | undefined;
  dates?: string | undefined;
  reply?: string | undefined;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;

const utcOf = (date: string): number => {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

/** Every day of the period, or `null` when it is too long to tick. */
function daysOf(period: PeriodView): readonly string[] | null {
  const start = utcOf(period.start);
  const count = Math.round((utcOf(period.end) - start) / DAY_MS) + 1;
  if (count > TICKED_DAYS_MAX || count < 1) return null;
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * DAY_MS).toISOString().slice(0, 10),
  );
}

const inPeriod = (date: string, period: PeriodView | null): boolean =>
  period === null || (date >= period.start && date <= period.end);

function fieldLinks(errors: Errors): readonly FieldLink[] {
  return [
    ...(errors.place === undefined
      ? []
      : [{ anchor: "rq06-place", label: "申請する店舗" }]),
    ...(errors.occasion === undefined
      ? []
      : [{ anchor: "rq06-pick", label: "参加するイベント" }]),
    ...(errors.dates === undefined
      ? []
      : [{ anchor: "rq06-dates", label: "参加日" }]),
    ...(errors.reply === undefined
      ? []
      : [{ anchor: "apply-reply", label: "追加の確認への回答" }]),
  ];
}

/** 提供中 / 提供開始前（10月10日から）. */
function offeringText(item: AttachableOption): string {
  const label = offeringPhaseLabel(item.offeringStatus);
  return item.offeringStatus.phase === "upcoming"
    ? `${label}（${jpDate(item.offeringStatus.startsOn)}から）`
    : label;
}

/** How an attached listing that is no longer attachable is worded. */
function heldText(item: AttachedListingItem): string {
  const { label, hidden } = attachedListingState(item);
  return hidden ? `${label} · 閲覧者に表示されていません` : label;
}

/**
 * RQ-06 参加の申請 (EVT-01, APP-02, APP-04): the store — fixed from SM-06,
 * chosen among the managed ones from DT-04 — the event (CF-02: published,
 * upcoming or ongoing; one that cannot be applied for shows why), and the
 * listings and days attached (any number, none included; the store's
 * published listings in any offering phase, days within the period).
 * Also the resubmission (store and event fixed) and the reapplication
 * (what can no longer be attached is left out and shown).
 */
export function ParticipationForm({ data }: { data: ParticipationFormData }) {
  const router = useRouter();
  const reconcile = useReconcile();
  const { mode } = data;
  const resubmit = mode.kind === "resubmit" ? mode : null;
  const fromEvent = data.opening === "occasion";

  const [place, setPlace] = useState<PlaceOption | null>(data.place);
  const [choice, setChoice] = useState<ParticipationChoice | null>(data.choice);
  const [picking, setPicking] = useState(
    data.choice === null ||
      (resubmit === null && data.choice.occasion.refusal !== null),
  );
  const [listingIds, setListingIds] = useState<readonly string[]>(
    data.start.listingIds,
  );
  const [dates, setDates] = useState<readonly string[]>(data.start.dates);
  const [newDate, setNewDate] = useState("");
  const [picked, setPicked] = useState<ReadonlyMap<string, string | null>>(
    () =>
      new Map(
        (data.choice?.attachable ?? []).map((item) => [item.id, item.name]),
      ),
  );
  const [stale, setStale] = useState<readonly string[] | null>(null);
  const [reply, setReply] = useState("");
  const [stage, setStage] = useState<"input" | "review">("input");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const [refusal, setRefusal] = useState<RelationRefusal | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const [loading, startLoad] = useTransition();
  useScrollTopOn(`${stage}:${done === null}:${refusal === null}`);
  const attempt = useRef<{ id: string; key: string } | null>(null);
  const refusals = useRef<Map<string, CandidateRefusal>>(new Map());
  // CF-02: the input survives a visit to a linked detail and back.
  const eventSearch = useRef<CandidateSnapshot | null>(null);
  const [restored, setRestored] = useState<
    Readonly<{ count: number; search: CandidateSnapshot | null }>
  >({ count: 0, search: null });
  const keepEventSearch = useCallback((snapshot: CandidateSnapshot) => {
    eventSearch.current = snapshot;
  }, []);
  const draft = useEntryDraft("rq06", participationDraftSchema, (kept) =>
    restore(kept),
  );

  const occasion = choice?.occasion ?? null;
  const period = occasion?.period ?? null;
  // The stores' reasons are about the event DT-04 chose; another event
  // is judged for the store chosen.
  const onPreset =
    occasion !== null &&
    occasion.occasionId === data.choice?.occasion.occasionId;
  const ready =
    place !== null &&
    occasion !== null &&
    (resubmit !== null || occasion.refusal === null) &&
    !picking;
  const busy = sending || loading;
  const held = new Map(data.held.map((item) => [item.id, item]));
  const attachable = new Map(
    (choice?.attachable ?? []).map((item) => [item.id, item]),
  );
  const heading =
    resubmit !== null
      ? "参加の申請を再提出"
      : stage === "review" && done === null && refusal === null
        ? "申請の内容を確かめる"
        : "イベントに参加";
  const title = (
    <ApplyTitle
      heading={heading}
      {...(place === null
        ? {}
        : {
            target: {
              name: place.name,
              status:
                place.operating === ""
                  ? "申請する店舗"
                  : `申請する店舗 · ${place.operating}`,
            },
          })}
    />
  );
  const dirty =
    resubmit !== null
      ? reply !== "" ||
        JSON.stringify(listingIds) !== JSON.stringify(data.start.listingIds) ||
        JSON.stringify(dates) !== JSON.stringify(data.start.dates)
      : place?.placeId !== data.place?.placeId ||
        occasion?.occasionId !== data.choice?.occasion.occasionId ||
        listingIds.length > 0 ||
        dates.length > 0;

  const fail = (failed: ErrorState, next: Errors) => {
    setErrors(next);
    setFailure({ kind: "error", state: failed, fields: fieldLinks(next) });
    setStage("input");
  };

  /** Reads the event for the store again: its reason, and the attachable listings now. */
  const load = (
    placeId: string,
    occasionId: string,
    reset: boolean,
    stillPicking = false,
  ) =>
    startLoad(async () => {
      try {
        const next = await participationChoiceFn({
          data: { placeId, occasionId },
        });
        setChoice(next);
        setPicked(
          (current) =>
            new Map([
              ...current,
              ...next.attachable.map((item) => [item.id, item.name] as const),
            ]),
        );
        setPicking(stillPicking || next.occasion.refusal !== null);
        if (reset) {
          setListingIds([]);
          setDates([]);
          setStale(null);
        }
        setErrors((current) => ({ ...current, occasion: undefined }));
      } catch (error) {
        fail(classifyError(error), {});
      }
    });

  function restore(kept: ParticipationDraft) {
    const keptPlace =
      kept.placeId === null
        ? null
        : (data.managed.find((item) => item.placeId === kept.placeId) ??
          (data.place?.placeId === kept.placeId ? data.place : null));
    setPlace(keptPlace);
    setListingIds(kept.listingIds);
    setDates(kept.dates);
    setReply(kept.reply);
    setPicked((current) => new Map([...current, ...kept.picked]));
    refusals.current = new Map(Object.entries(kept.search?.refusals ?? {}));
    setRestored((current) => ({
      count: current.count + 1,
      search:
        kept.search === null
          ? null
          : { keyword: kept.search.keyword, found: kept.search.found },
    }));
    if (keptPlace === null || kept.occasionId === null) {
      setChoice(
        kept.occasionId !== null &&
          kept.occasionId === data.choice?.occasion.occasionId
          ? data.choice
          : null,
      );
      setPicking(kept.picking);
      return;
    }
    // Read again: the event's reason and the attachable listings may have
    // changed while the user was away.
    load(keptPlace.placeId, kept.occasionId, false, kept.picking);
  }

  const stashOnLeave = (event: MouseEvent<HTMLFormElement>) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("a[href]") === null) return;
    const search = eventSearch.current;
    draft.stash({
      placeId: place?.placeId ?? null,
      occasionId: choice?.occasion.occasionId ?? null,
      picking,
      listingIds,
      picked: [...picked.entries()],
      dates,
      reply,
      search:
        search === null
          ? null
          : { ...search, refusals: Object.fromEntries(refusals.current) },
    });
  };

  const choosePlace = (next: PlaceOption) => {
    setPlace(next);
    setErrors((current) => ({ ...current, place: undefined }));
    if (occasion !== null) load(next.placeId, occasion.occasionId, true);
  };

  const check = () => {
    const missing: { place?: string; occasion?: string; dates?: string } = {};
    if (place === null) missing.place = "申請する店舗を選んでください";
    if (occasion === null || picking) {
      missing.occasion = "参加するイベントを選んでください";
    } else if (resubmit === null && occasion.refusal !== null) {
      missing.occasion = `${occasion.name}は選べません。${occasion.refusal.reason}`;
    }
    const outside = dates.filter((date) => !inPeriod(date, period));
    if (outside.length > 0 && period !== null) {
      missing.dates = `${outside.map(jpDateWithWeekday).join("、")}は開催期間の外です。外してください`;
    }
    if (Object.keys(missing).length > 0) {
      fail(
        missing.dates !== undefined &&
          missing.place === undefined &&
          missing.occasion === undefined &&
          period !== null
          ? {
              ...INPUT_ERROR,
              message: `開催期間（${periodText(period)}）の外の参加日があります`,
            }
          : INPUT_ERROR,
        missing,
      );
      return;
    }
    setErrors({});
    setFailure(null);
    if (resubmit === null) setStage("review");
    else send();
  };

  const content = { listingIds: [...listingIds], dates: [...dates] };

  const send = () =>
    startSend(async () => {
      if (place === null || occasion === null) return;
      const target = {
        placeId: place.placeId,
        occasionId: occasion.occasionId,
      };
      try {
        if (resubmit !== null) {
          const result = await resubmitApplicationFn({
            data: {
              applicationId: resubmit.applicationId,
              version: resubmit.version,
              amended: { kind: "participation", ...content },
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
          draft.clear();
          setDone(resubmit.applicationId);
          return;
        }
        const key = JSON.stringify({ ...target, ...content });
        if (attempt.current?.key !== key) {
          attempt.current = { id: newId(), key };
        }
        const { applicationId } = await submitParticipationFn({
          data: { applicationId: attempt.current.id, ...target, ...content },
        });
        attempt.current = null;
        router.clearCache();
        draft.clear();
        setDone(applicationId);
      } catch (error) {
        const failed = classifyError(error);
        if (
          failed.kind === "conflict" &&
          failed.code === APPLICATION_ID_CONFLICT
        ) {
          setStage("input");
          setFailure({
            kind: "taken",
            applicationId: attempt.current?.id ?? "",
          });
          return;
        }
        if (failed.code === NOT_ATTACHABLE) {
          // CS-08: the input stays; the listings that can no longer be
          // attached are marked against the latest candidates.
          try {
            const next =
              resubmit === null || choice === null
                ? await participationChoiceFn({ data: target })
                : {
                    ...choice,
                    ...(await participationListingsFn({ data: target })),
                  };
            setChoice(next);
            setPicked(
              (current) =>
                new Map([
                  ...current,
                  ...next.attachable.map(
                    (item) => [item.id, item.name] as const,
                  ),
                ]),
            );
            const now = new Set(next.attachable.map((item) => item.id));
            setStale(listingIds.filter((id) => !now.has(id) && !held.has(id)));
          } catch {
            setStale([]);
          }
          setFailure(null);
          setStage("input");
          return;
        }
        if (failed.code === OUT_OF_PERIOD) {
          const outside = dates.filter((date) => !inPeriod(date, period));
          fail(failed, {
            dates:
              outside.length === 0
                ? "開催期間の外の参加日があります。外してください"
                : `${outside.map(jpDateWithWeekday).join("、")}は開催期間の外です。外してください`,
          });
          return;
        }
        if (
          resubmit === null &&
          (failed.kind === "forbidden" ||
            (failed.kind === "premiseChanged" &&
              failed.code !== null &&
              REFUSED_CODES.has(failed.code)))
        ) {
          try {
            const refused = await checkParticipationFn({ data: target });
            if (refused !== null) {
              setRefusal(refused);
              return;
            }
          } catch {
            // The alert below says the submission failed.
          }
        }
        const reason = replyError(failed);
        fail(failed, reason === undefined ? {} : { reply: reason });
      }
    });

  const chooseAgain = () => {
    setRefusal(null);
    setStage("input");
    setChoice(null);
    setPicking(true);
    setListingIds([]);
    setDates([]);
    setStale(null);
  };

  if (refusal !== null) {
    const again =
      refusal.kind === "occasionClosed" ||
      refusal.kind === "participating" ||
      refusal.kind === "targetUnavailable";
    return again ? (
      <RelationRefused
        heading={heading}
        refusal={refusal}
        what="participation"
        onChooseAgain={chooseAgain}
      />
    ) : (
      <KeepOutcome
        view={
          <RelationRefused
            heading={heading}
            refusal={refusal}
            what="participation"
          />
        }
      />
    );
  }

  if (done !== null) {
    return (
      <KeepOutcome
        view={
          <ManagePage title={<ApplyTitle heading={heading} />}>
            <FocusOnMount>
              <DonePanel
                title={
                  resubmit === null
                    ? "参加の申請を送りました"
                    : "参加の申請を再提出しました"
                }
                actions={
                  <>
                    <ButtonLink to={applicationPath(done)}>
                      申請の詳細を見る
                    </ButtonLink>
                    {place === null ? null : (
                      <>
                        <ButtonLink
                          variant="secondary"
                          to={shopEventsPath(place.placeId)}
                        >
                          イベントの状況へ
                        </ButtonLink>
                        <ButtonLink
                          variant="secondary"
                          to={shopHomePath(place.placeId)}
                        >
                          店舗ホームに戻る
                        </ButtonLink>
                      </>
                    )}
                  </>
                }
              >
                {resubmit === null
                  ? `${occasion?.name ?? "イベント"}への参加の申請は、確認中になりました。イベントの運営者が確かめて、結果を通知します。参加が決まると、イベントのページに店舗と添えた掲載が並びます。`
                  : "申請は確認中に戻りました。イベントの運営者が確かめた結果は、通知でお知らせします。"}
              </DonePanel>
            </FocusOnMount>
          </ManagePage>
        }
      />
    );
  }

  const listingName = (id: string): string => {
    const name = attachable.get(id)?.name ?? picked.get(id);
    if (name !== undefined && name !== null) return name;
    const kept = held.get(id);
    if (kept === undefined) return "名称未設定";
    return kept.deleted ? "削除された掲載" : (kept.name ?? "名称未設定");
  };

  const listingPhoto = (
    id: string,
  ): Readonly<{ src: string; alt: string }> | null => {
    const kept = held.get(id);
    const url =
      attachable.get(id)?.photoUrl ??
      (kept === undefined || kept.deleted ? null : kept.photoUrl);
    return url === null ? null : { src: url, alt: "" };
  };

  const listingLine = (id: string): string => {
    const item = attachable.get(id);
    if (item !== undefined)
      return `${listingName(id)}（${offeringText(item)}）`;
    const kept = held.get(id);
    return kept === undefined
      ? `${listingName(id)}（添えられません）`
      : `${listingName(id)}（${heldText(kept)}）`;
  };

  if (stage === "review" && place !== null && occasion !== null) {
    return (
      <ManagePage
        title={title}
        actions={
          <>
            <Button disabled={sending} onClick={send}>
              {sending ? "申請しています…" : "この内容で参加申請"}
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
              次の内容で、イベントへの参加を申請します。提出すると、イベントの運営者が確かめるまで確認中になります。
            </p>
            <ReviewList
              items={[
                { term: "申請する店舗", value: place.name },
                {
                  term: "イベント",
                  value:
                    occasion.periodText === ""
                      ? occasion.name
                      : `${occasion.name}（${occasion.periodText}）`,
                },
                {
                  term: "参加する掲載",
                  value:
                    listingIds.length === 0
                      ? "添えない"
                      : listingIds.map(listingLine).join("、"),
                },
                {
                  term: "参加日",
                  value:
                    dates.length === 0
                      ? "添えない"
                      : dates.map(jpDateWithWeekday).join("・"),
                },
              ]}
            />
          </ManageBody>
        </FocusOnMount>
      </ManagePage>
    );
  }

  const cancel =
    resubmit !== null ? (
      <ButtonLink
        variant="secondary"
        to={applicationPath(resubmit.applicationId)}
      >
        申請の詳細に戻る
      </ButtonLink>
    ) : place !== null ? (
      <ButtonLink variant="secondary" to={shopHomePath(place.placeId)}>
        店舗ホームに戻る
      </ButtonLink>
    ) : occasion !== null ? (
      <ButtonLink
        variant="secondary"
        to="/events/$occasionId"
        params={{ occasionId: occasion.occasionId }}
      >
        イベントに戻る
      </ButtonLink>
    ) : (
      <ButtonLink variant="secondary" to="/me">
        マイページへ戻る
      </ButtonLink>
    );

  const candidates = (choice?.attachable ?? []).filter(
    (item) => !listingIds.includes(item.id),
  );
  const days = period === null ? null : daysOf(period);
  const shownDays = [...new Set([...(days ?? []), ...dates])].sort();
  const addDate = () => {
    const date = newDate.trim();
    if (date === "") {
      setErrors((current) => ({
        ...current,
        dates: "追加する参加日を選んでください",
      }));
      return;
    }
    if (!dates.includes(date)) setDates([...dates, date].sort());
    setNewDate("");
    setErrors((current) => ({ ...current, dates: undefined }));
  };

  const pickSection =
    place === null || resubmit !== null || !picking ? null : (
      <section className="m-section" aria-labelledby="rq06-pick">
        <SectionTitle variant="manage" id="rq06-pick">
          参加するイベント
        </SectionTitle>
        {occasion !== null && occasion.refusal !== null ? (
          <Notice
            variant="manage"
            tone="paper"
            title={`${occasion.name}には、申請できません`}
            {...(occasion.refusal.go === null
              ? {}
              : {
                  actions: (
                    <TextLink to={refusalLinkOf(occasion.refusal.go).href}>
                      {refusalLinkOf(occasion.refusal.go).label}
                    </TextLink>
                  ),
                })}
          >
            {`${occasion.refusal.reason}。別のイベントを選んでください。`}
          </Notice>
        ) : null}
        <CandidateSearch
          key={`${place.placeId}:${restored.count}`}
          initial={restored.search}
          keep={keepEventSearch}
          id="rq06-event-q"
          label="イベントを探す"
          placeholder="イベントの名称など"
          help="公開中で、開催前か開催中のイベントから選べます。"
          disabled={busy}
          search={async (keyword) => {
            const page = await findParticipationOccasionsFn({
              data: { placeId: place.placeId, keyword },
            });
            refusals.current = new Map(Object.entries(page.refusals));
            return page;
          }}
          detailPath={(id) => `/events/${encodeURIComponent(id)}`}
          detailLabel="詳細"
          refusedAction={(item) => {
            const go = refusals.current.get(item.id)?.go ?? null;
            if (go === null) {
              return (
                <ChipButton disabled aria-label={`${item.name}は選べません`}>
                  選べません
                </ChipButton>
              );
            }
            const link = refusalLinkOf(go);
            return <ChipLink to={link.href}>{link.label}</ChipLink>;
          }}
          onPick={(item) => load(place.placeId, item.id, true)}
          noMatch={(keyword) => (
            <EmptyPanel
              headingLevel="h3"
              title="参加を申請できるイベントがありません"
            >
              {`「${keyword}」に当たる、開催前か開催中のイベントはありません。語を変えて探し直せます。`}
            </EmptyPanel>
          )}
        />
        {occasion !== null && occasion.refusal === null ? (
          <TextButton onClick={() => setPicking(false)}>
            選び直さずに戻る
          </TextButton>
        ) : null}
        {errors.occasion === undefined ? null : (
          <p className="m-field__error">{errors.occasion}</p>
        )}
        {loading ? (
          <p className="m-field__help" role="status">
            イベントを読み込んでいます…
          </p>
        ) : null}
      </section>
    );

  return (
    <ManagePage
      title={title}
      actions={
        <>
          <Button
            type="submit"
            form="rq06-form"
            disabled={
              busy ||
              failure?.kind === "lapsed" ||
              (!ready && resubmit === null)
            }
          >
            {resubmit === null
              ? "入力した内容を確かめる"
              : sending
                ? "再提出しています…"
                : "この内容で再提出する"}
          </Button>
          {cancel}
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
                "提出していない入力があります。提出せずに画面を離れると、入力した内容は残りません。",
            }
          : {})}
    >
      <form
        className="m-body"
        id="rq06-form"
        onClickCapture={stashOnLeave}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          check();
        }}
      >
        <HydrationGate>
          {failure === null ? null : (
            <SubmitFailureAlert
              failure={failure}
              resubmit={resubmit !== null}
              applicationId={resubmit?.applicationId ?? null}
              busy={busy}
              onReload={() =>
                startSend(async () => {
                  setFailure(null);
                  await reconcile();
                })
              }
              retry={
                <Button variant="secondary" disabled={busy} onClick={send}>
                  もう一度送る
                </Button>
              }
            />
          )}
          {stale === null ? null : (
            <FocusOnMount role="alert">
              <Alert title="添えた掲載の一部を、添えられなくなっていました">
                {stale.length === 0
                  ? "申請は送っていません。最新の添えられる掲載から選び直してください。"
                  : `申請は送っていません。${stale.map(listingName).join("、")}は、いまは添えられません。外して、最新の添えられる掲載から選び直してください。`}
              </Alert>
            </FocusOnMount>
          )}
          <ModeNotice mode={mode} reapplied="イベント・掲載・参加日" />
          {data.removed === null ? null : (
            <Notice
              variant="manage"
              tone="paper"
              title="いまは添えられないものを外しました"
            >
              {[
                ...data.removed.listings.map(
                  (item) =>
                    `${item.deleted ? "削除された掲載" : (item.name ?? "名称未設定")}（${attachedListingState(item).label}のため外しました）`,
                ),
                ...data.removed.dates.map(
                  (date) =>
                    `${jpDateWithWeekday(date)}（開催期間の外のため外しました）`,
                ),
              ].join("、")}
            </Notice>
          )}

          {fromEvent && resubmit === null ? (
            <fieldset className="m-field" id="rq06-place">
              <legend className="m-field__label" id="rq06-place-label">
                申請する店舗
                <span className="m-field__req">必須</span>
              </legend>
              <CandidateRadios
                name="rq06-place"
                labelledBy="rq06-place-label"
                items={data.managed.map((item) => ({
                  id: item.placeId,
                  name: item.name,
                  meta: item.meta,
                  photoUrl: item.photoUrl,
                  // Each store was judged for the event DT-04 chose.
                  refusal: onPreset ? item.refusal : null,
                  detailHref: item.viewable
                    ? `/places/${encodeURIComponent(item.placeId)}`
                    : null,
                }))}
                value={place?.placeId ?? null}
                disabled={busy}
                invalid={errors.place !== undefined}
                onChange={(id) => {
                  const next = data.managed.find((item) => item.placeId === id);
                  if (next !== undefined) choosePlace(next);
                }}
              />
              {errors.place === undefined ? null : (
                <p className="m-field__error">{errors.place}</p>
              )}
              <p className="m-field__help">
                管理する店舗から選びます。選んだ店舗は、あとで選び直せます。
              </p>
            </fieldset>
          ) : null}

          {place === null && occasion !== null ? (
            <section className="m-section" aria-labelledby="rq06-event">
              <SectionTitle variant="manage" id="rq06-event">
                参加するイベント
              </SectionTitle>
              <RowLink
                to="/events/$occasionId"
                params={{ occasionId: occasion.occasionId }}
                photo={
                  occasion.photoUrl === null
                    ? null
                    : { src: occasion.photoUrl, alt: "" }
                }
                name={occasion.name}
                meta={occasion.periodText}
              />
              <p className="m-field__help">
                申請する店舗を選ぶと、添える掲載と参加日を選べます。
              </p>
            </section>
          ) : null}

          {pickSection}

          {occasion !== null && place !== null && !picking ? (
            <>
              {occasion.photoUrl === null ? null : (
                <div className="m-photo">
                  <img src={occasion.photoUrl} alt="" />
                </div>
              )}
              <p className="rq06-event__name">{occasion.name}</p>
              <div className="m-section">
                <div className="rq06-event__meta">
                  {occasion.periodText === "" ? null : (
                    <p>{occasion.periodText}</p>
                  )}
                  {occasion.venue === "" ? null : (
                    <p>{`開催場所：${occasion.venue}`}</p>
                  )}
                </div>
                <div className="rq06-event__links">
                  {occasion.viewable ? (
                    <TextLink
                      to="/events/$occasionId"
                      params={{ occasionId: occasion.occasionId }}
                    >
                      イベントの詳細を見る
                    </TextLink>
                  ) : null}
                  {resubmit === null ? (
                    <TextButton
                      disabled={busy}
                      onClick={() => setPicking(true)}
                    >
                      イベントを選び直す
                    </TextButton>
                  ) : null}
                </div>
              </div>
              <Notice variant="manage" title="参加の申請について">
                イベントの運営者が確かめてから、参加が決まります。掲載と参加日は、どちらも添えずに申請できます。
              </Notice>

              <section className="m-section" aria-labelledby="rq06-listings">
                <SectionTitle variant="manage" id="rq06-listings">
                  参加する掲載
                </SectionTitle>
                {listingIds.length === 0 ? (
                  <p className="m-field__help">
                    まだ添えた掲載はありません。添えずに申請することもできます。
                  </p>
                ) : (
                  <ul className="m-rows">
                    {listingIds.map((id) => {
                      const item = attachable.get(id);
                      const kept = held.get(id);
                      const name = listingName(id);
                      const blocked =
                        item === undefined && (stale?.includes(id) ?? true);
                      const meta =
                        item !== undefined
                          ? `選択中 · ${offeringText(item)}`
                          : kept !== undefined
                            ? heldText(kept)
                            : "いまは添えられません";
                      return (
                        <li key={id} className="rq06-row">
                          {item !== undefined ? (
                            <RowLink
                              to="/listings/$listingId"
                              params={{ listingId: id }}
                              photo={listingPhoto(id)}
                              name={name}
                              meta={meta}
                              sub={place.name}
                            />
                          ) : (
                            <Row
                              photo={listingPhoto(id)}
                              name={name}
                              meta={
                                <span
                                  className="rq06-row__state"
                                  {...(blocked || kept !== undefined
                                    ? { "data-tone": "alert" }
                                    : {})}
                                >
                                  {meta}
                                </span>
                              }
                              sub={place.name}
                            />
                          )}
                          <ChipButton
                            disabled={busy}
                            aria-label={`${name}を外す`}
                            onClick={() => {
                              const rest = listingIds.filter(
                                (listed) => listed !== id,
                              );
                              setListingIds(rest);
                              if (stale?.every((s) => !rest.includes(s))) {
                                setStale(null);
                              }
                            }}
                          >
                            外す
                          </ChipButton>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {(choice?.attachable.length ?? 0) === 0 ? (
                  <Notice
                    variant="manage"
                    tone="paper"
                    title="添えられる掲載がありません"
                    actions={
                      <TextLink
                        to="/manage/places/$placeId/listings"
                        params={{ placeId: place.placeId }}
                      >
                        掲載の一覧へ
                      </TextLink>
                    }
                  >
                    掲載を添えずに申請できます。添えたい掲載が公開されていなければ、先に掲載の編集で公開してください。
                  </Notice>
                ) : candidates.length === 0 ? (
                  <p className="m-field__help">
                    添えられる掲載は、ほかにありません。
                  </p>
                ) : (
                  <div className="em-sub">
                    <p className="m-field__label">添えられる掲載</p>
                    <ul className="m-rows">
                      {candidates.map((item) => {
                        const name = item.name ?? "名称未設定";
                        return (
                          <li key={item.id} className="rq06-row">
                            <RowLink
                              to="/listings/$listingId"
                              params={{ listingId: item.id }}
                              photo={
                                item.photoUrl === null
                                  ? null
                                  : { src: item.photoUrl, alt: "" }
                              }
                              name={name}
                              meta={offeringText(item)}
                            />
                            <ChipButton
                              disabled={busy}
                              aria-label={`${name}を添える`}
                              onClick={() => {
                                setPicked((current) =>
                                  new Map(current).set(item.id, item.name),
                                );
                                setListingIds([...listingIds, item.id]);
                              }}
                            >
                              添える
                            </ChipButton>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                <p className="m-field__help">
                  この店舗の公開中の掲載から、複数を選べます。提供開始前・提供終了の掲載も選べます。下書き・一時非公開・運営による非公開の掲載は、候補に出ません。
                </p>
                {(choice?.attachable.length ?? 0) > 0 && choice?.unpublished ? (
                  <Notice
                    variant="manage"
                    tone="paper"
                    title="公開していない掲載があります"
                    actions={
                      <TextLink
                        to="/manage/places/$placeId/listings"
                        params={{ placeId: place.placeId }}
                      >
                        掲載の一覧へ
                      </TextLink>
                    }
                  >
                    添えたい掲載が公開されていなければ、先に掲載の編集で公開してください。公開すると、ここで添えられます。
                  </Notice>
                ) : null}
              </section>

              <Fieldset
                id="rq06-dates"
                legend="参加日"
                requirement="optional"
                help={
                  period === null
                    ? "開催期間が読めないため、選んだ参加日だけを示しています。"
                    : `開催期間（${periodText(period)}）の中から、複数を選べます。`
                }
                {...(errors.dates === undefined ? {} : { error: errors.dates })}
              >
                {days === null && period !== null ? (
                  <div className="m-inline">
                    <input
                      className="m-input"
                      type="date"
                      aria-label="参加日を追加"
                      min={period.start}
                      max={period.end}
                      value={newDate}
                      disabled={busy}
                      onChange={(event) =>
                        setNewDate(event.currentTarget.value)
                      }
                    />
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={addDate}
                    >
                      追加
                    </Button>
                  </div>
                ) : null}
                {shownDays.length === 0 ? null : (
                  <div className="m-choices">
                    {(days === null ? dates : shownDays).map((date) => {
                      const outside = !inPeriod(date, period);
                      return (
                        <label className="m-choice" key={date}>
                          <input
                            type="checkbox"
                            name="date"
                            value={date}
                            checked={dates.includes(date)}
                            disabled={busy}
                            aria-invalid={outside ? true : undefined}
                            onChange={(event) => {
                              const on = event.currentTarget.checked;
                              const next = on
                                ? [...dates, date].sort()
                                : dates.filter((d) => d !== date);
                              setDates(next);
                              if (next.every((d) => inPeriod(d, period))) {
                                setErrors((current) => ({
                                  ...current,
                                  dates: undefined,
                                }));
                              }
                            }}
                          />
                          <span>{jpDateWithWeekday(date)}</span>
                          {outside ? (
                            <Badge tone="alert">開催期間の外</Badge>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                )}
              </Fieldset>
            </>
          ) : null}

          {resubmit === null ? null : (
            <ReplyField
              value={reply}
              onChange={setReply}
              disabled={busy}
              {...(errors.reply === undefined ? {} : { error: errors.reply })}
            />
          )}
        </HydrationGate>
      </form>
    </ManagePage>
  );
}
