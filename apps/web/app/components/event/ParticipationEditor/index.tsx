"use client";

import { useNavigate, useRouter } from "@tanstack/react-router";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { CandidateSearch } from "@/components/event/CandidatePicker";
import {
  EventNav,
  EventTarget,
  occasionPagePath,
} from "@/components/event/EventShell";
import { ProxyUnavailablePanel } from "@/components/event/EventShell/EventProblem";
import { useOccasionFrame } from "@/components/event/EventShell/useOccasionFrame";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import {
  listingPagePath,
  placePagePath,
  ShopNav,
  ShopTarget,
} from "@/components/manage/ShopShell";
import { usePlaceFrame } from "@/components/manage/ShopShell/usePlaceFrame";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChipButton, ChipLink } from "@/components/ui/ChipButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Field, Input } from "@/components/ui/Field";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink, Row, RowLink } from "@/components/ui/Rows";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TextLink } from "@/components/ui/TextButton";
import {
  isDirty,
  reloadDraft,
  savedDraft,
  settledDraft,
  useEditDraft,
} from "@/presentation/editDraft";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import {
  jpDate,
  jpDateWithWeekday,
  type OfferingStatus,
  offeringPhaseLabel,
} from "@/presentation/listingView";
import {
  addParticipationFn,
  findPlaceCandidatesFn,
  saveParticipationFn,
  withdrawParticipationFn,
} from "@/presentation/occasion";
import {
  type AttachedListingItem,
  attachedListingState,
  HOLDING_LABEL,
  occasionName,
  occasionPublicationLabel,
  type ParticipationEditorData,
  periodText,
} from "@/presentation/occasionView";
import { OPERATING_STATUS_LABEL } from "@/presentation/placeView";
import { useReconcile } from "@/presentation/reconcile";

type Mode = "edit" | "add";

type Values = Readonly<{
  listingIds: readonly string[];
  /** Ascending `YYYY-MM-DD`. */
  dates: readonly string[];
}>;

const valuesOf = (data: ParticipationEditorData): Values => ({
  listingIds: data.participation?.listings.map((listing) => listing.id) ?? [],
  dates: data.participation?.dates ?? [],
});

type Outcome =
  | Readonly<{ kind: "saved" }>
  | Readonly<{ kind: "added" }>
  | Readonly<{ kind: "withdrawn" }>
  /** `atSave`: dissolved while editing; otherwise already dissolved when opened. */
  | Readonly<{ kind: "gone"; atSave: boolean }>
  | Readonly<{ kind: "lostAccess" }>;

type Failure = Readonly<{
  state: ErrorState;
  attempt: "save" | "add" | "withdraw";
}>;

type PageProps = {
  heading: string;
  actions?: ReactNode;
  actionsNote?: ReactNode;
  children: ReactNode;
};

/** SM-06, a plain path: the place's events screen belongs to the store area's own stage. */
const placeEventsPath = (placeId: string): string =>
  `/manage/places/${encodeURIComponent(placeId)}/events`;

const inPeriod = (
  date: string,
  period: ParticipationEditorData["occasion"]["period"],
): boolean => period !== null && date >= period.start && date <= period.end;

/** An upcoming listing's first day; the offering badge says the rest. */
const listingMeta = (status: OfferingStatus): Readonly<{ meta?: string }> =>
  status.phase === "upcoming" ? { meta: `${jpDate(status.startsOn)}から` } : {};

function OfferingBadge({ status }: { status: OfferingStatus }) {
  return (
    <Badge
      tone={
        status.phase === "available"
          ? "accent"
          : status.phase === "ended"
            ? "muted"
            : "neutral"
      }
    >
      {offeringPhaseLabel(status)}
    </Badge>
  );
}

function PlacePage({ heading, actions, actionsNote, children }: PageProps) {
  const frame = usePlaceFrame();
  return (
    <ManagePage
      title={
        <ManageTitle>
          <TextLink to={placeEventsPath(frame.placeId)} className="cm04-back">
            イベントの状況へ戻る
          </TextLink>
          <ShopTarget frame={frame} />
          <ManageHeading>{heading}</ManageHeading>
        </ManageTitle>
      }
      nav={<ShopNav frame={frame} />}
      {...(actions === undefined ? {} : { actions })}
      {...(actionsNote === undefined ? {} : { actionsNote })}
    >
      {children}
    </ManagePage>
  );
}

/** The store's steward's CM-04, in the store's frame (SM-06 is its way back). */
export function PlaceParticipationEditor({
  data,
}: {
  data: ParticipationEditorData;
}) {
  const frame = usePlaceFrame();
  return (
    <ParticipationEditor
      data={data}
      mode="edit"
      proxy={false}
      placeName={frame.name}
      Page={PlacePage}
    />
  );
}

function OccasionPage({ heading, actions, actionsNote, children }: PageProps) {
  const frame = useOccasionFrame();
  return (
    <ManagePage
      title={
        <ManageTitle>
          <TextLink
            to="/manage/events/$occasionId"
            params={{ occasionId: frame.occasionId }}
            className="cm04-back"
          >
            参加店舗と申請へ戻る
          </TextLink>
          <EventTarget frame={frame} />
          <ManageHeading>{heading}</ManageHeading>
        </ManageTitle>
      }
      nav={
        <EventNav
          occasionId={frame.occasionId}
          proxy={frame.basis === "proxy"}
          current="participants"
        />
      }
      {...(actions === undefined ? {} : { actions })}
      {...(actionsNote === undefined ? {} : { actionsNote })}
    >
      {children}
    </ManagePage>
  );
}

/** The event operator's CM-04 (change or add), in the event's frame. */
export function OccasionParticipationEditor({
  data,
  mode,
}: {
  data: ParticipationEditorData;
  mode: Mode;
}) {
  const frame = useOccasionFrame();
  return (
    <ParticipationEditor
      data={data}
      mode={mode}
      proxy={frame.basis === "proxy"}
      placeName={data.place.name}
      Page={OccasionPage}
    />
  );
}

/**
 * CM-04 追加, before a place is chosen: CF-02 over the places without a
 * steward that viewers can see. A participating place cannot be chosen and
 * leads to its participation instead.
 */
export function PlacePicker() {
  const frame = useOccasionFrame();
  const navigate = useNavigate();
  const params = { occasionId: frame.occasionId };
  return (
    <OccasionPage heading="参加店舗を追加">
      <ManageBody>
        <section className="m-section" aria-labelledby="cm04-join">
          <SectionTitle variant="manage" id="cm04-join">
            参加
          </SectionTitle>
          <CandidateSearch
            id="cm04-shop-q"
            label="店舗を探す"
            placeholder="例: ベーカリー、港町"
            help="店舗管理者のいない、公開中の店舗から選びます。店舗管理者のいる店舗は、店舗管理者が参加を申請します。"
            search={(keyword) =>
              findPlaceCandidatesFn({
                data: { occasionId: frame.occasionId, keyword },
              })
            }
            detailPath={placePagePath}
            detailLabel="店舗ページ"
            onPick={(item) =>
              void navigate({
                to: "/manage/events/$occasionId/participants/new",
                params,
                search: { place: item.id },
              })
            }
            refusedAction={(item) =>
              item.participating === true ? (
                <ChipLink
                  to="/manage/events/$occasionId/participants/$placeId"
                  params={{ ...params, placeId: item.id }}
                >
                  参加内容を変更
                </ChipLink>
              ) : null
            }
          />
          <p className="m-field__help">
            候補の店舗ページで、閲覧者への見え方を確かめられます。すでに参加中の店舗は選べません。
          </p>
        </section>
      </ManageBody>
    </OccasionPage>
  );
}

/**
 * CM-04 参加内容の編集 (EVT-02, EVT-03, EVT-10): one place's
 * participation in one event — the attached listings (the place's
 * published ones, whatever their offering) and the dates (within the
 * holding period: a date outside it is marked in the list and the save
 * refuses it, CS-10) — saved without approval, whatever the holding status. The
 * place's steward may also withdraw (CS-12); the event's operator adds or
 * changes a participant without a steward, and cannot once one takes
 * over.
 */
function ParticipationEditor({
  data,
  mode,
  proxy,
  placeName,
  Page,
}: {
  data: ParticipationEditorData;
  mode: Mode;
  proxy: boolean;
  placeName: string | null;
  Page: (props: PageProps) => ReactNode;
}) {
  const router = useRouter();
  const reconcile = useReconcile();
  const side = data.side;
  const occasion = data.occasion;
  const period = occasion.period;
  const params = { occasionId: occasion.id };
  const heading = mode === "add" ? "参加店舗を追加" : "参加内容を編集";
  const shopName = placeName ?? "この店舗";
  const eventName = occasionName(occasion.name);

  const source = useMemo(
    () => ({ ...data, version: data.participation?.version ?? 0 }),
    [data],
  );
  const [draft, setDraft] = useEditDraft(source, valuesOf);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const { values } = draft;
  const dirty = isDirty(draft);
  const [outcome, setOutcome] = useState<Outcome | null>(
    mode === "edit" && data.participation === null
      ? { kind: "gone", atSave: false }
      : null,
  );
  const [failure, setFailure] = useState<Failure | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  /** The names of the listings attached here, kept for when one stops being attachable before the save. */
  const [picked, setPicked] = useState<ReadonlyMap<string, string | null>>(
    () => new Map(),
  );
  const [busy, startBusy] = useTransition();
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (failure !== null) alertRef.current?.focus();
  }, [failure]);

  const stewardArrived =
    side === "occasion" &&
    (data.place.hasSteward ||
      failure?.state.code === "OCCASION_PLACE_HAS_STEWARD");
  const alreadyParticipating =
    mode === "add" &&
    (data.participation !== null ||
      failure?.state.code === "OCCASION_ALREADY_PARTICIPATING");

  const fail = async (error: unknown, attempt: Failure["attempt"]) => {
    const state = classifyError(error);
    if (state.kind === "notFound" && state.code === "PARTICIPATION_NOT_FOUND") {
      setOutcome({ kind: "gone", atSave: true });
      return;
    }
    if (state.kind === "forbidden" && !proxy) {
      setOutcome({ kind: "lostAccess" });
      router.clearCache();
      return;
    }
    if (
      state.code === "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD" &&
      state.kind === "invalidInput"
    ) {
      const outside = draftRef.current.values.dates.filter(
        (date) => !inPeriod(date, period),
      );
      setDateError(
        period === null
          ? "開催期間が決まっていないため、参加日は添えられません。参加日を外してください"
          : `${outside.length === 0 ? "参加日" : outside.map(jpDate).join("、")}は開催期間の外です。参加日は、開催期間（${periodText(period)}）の日付に限ります`,
      );
    }
    setFailure({ state, attempt });
    if (state.kind === "premiseChanged") await reconcile();
  };

  const save = () =>
    startBusy(async () => {
      setFailure(null);
      setDateError(null);
      setDraft(settledDraft);
      const { values: submitted, version } = draftRef.current;
      try {
        if (mode === "add") {
          await addParticipationFn({
            data: {
              occasionId: occasion.id,
              placeId: data.place.id,
              listingIds: [...submitted.listingIds],
              dates: [...submitted.dates],
            },
          });
          setOutcome({ kind: "added" });
          await reconcile();
          return;
        }
        const saved = await saveParticipationFn({
          data: {
            side,
            occasionId: occasion.id,
            placeId: data.place.id,
            version,
            listingIds: [...submitted.listingIds],
            dates: [...submitted.dates],
          },
        });
        setDraft((current) => savedDraft(current, submitted, saved.version));
        setOutcome({ kind: "saved" });
        await reconcile();
      } catch (error) {
        await fail(error, mode === "add" ? "add" : "save");
      }
    });

  const withdraw = () =>
    startBusy(async () => {
      setConfirming(false);
      setFailure(null);
      try {
        await withdrawParticipationFn({
          data: { occasionId: occasion.id, placeId: data.place.id },
        });
        setOutcome({ kind: "withdrawn" });
        await reconcile();
      } catch (error) {
        await fail(error, "withdraw");
      }
    });

  const change = (next: Partial<Values>) =>
    setDraft((current) => ({
      ...current,
      values: { ...current.values, ...next },
    }));

  // An out-of-period date is added and marked; the save refuses it (CS-10),
  // so the form keeps it for the steward to see and remove.
  const addDate = () => {
    const date = newDate.trim();
    if (date === "") {
      setDateError("追加する参加日を選んでください");
      return;
    }
    setDateError(null);
    if (!values.dates.includes(date)) {
      change({ dates: [...values.dates, date].sort() });
    }
    setNewDate("");
  };

  const occasionViewable =
    occasion.publication.status === "published" && !occasion.suspended;
  const eventLink = (
    <ButtonLink variant="secondary" to={occasionPagePath(occasion.id)}>
      イベントページを見る
    </ButtonLink>
  );
  const shownLater = `${eventName}は閲覧者に表示されていないため、イベントページにはまだ表示されません。イベントが閲覧者に表示されるようになると、表示されます。`;
  const backToList =
    side === "place" ? (
      <ButtonLink to={placeEventsPath(data.place.id)}>
        イベントの状況へ
      </ButtonLink>
    ) : (
      <ButtonLink to="/manage/events/$occasionId" params={params}>
        参加店舗と申請へ
      </ButtonLink>
    );

  if (outcome?.kind === "gone" || outcome?.kind === "lostAccess") {
    return (
      <Page heading={heading}>
        <ManageBody>
          <FocusOnMount role="alert">
            {outcome.kind === "gone" ? (
              <EmptyPanel
                title="この参加は解除されています"
                actions={backToList}
              >
                {outcome.atSave
                  ? `保存するまでの間に、${shopName}の${eventName}への参加が、取りやめか除外で解除されていました。変更は保存していません。`
                  : `${shopName}の${eventName}への参加は、取りやめか除外で、すでに解除されています。`}
              </EmptyPanel>
            ) : (
              <EmptyPanel
                title="この参加内容を編集する権限がありません"
                actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
              >
                参加内容は、その店舗の店舗管理者と、店舗管理者のいない店舗ではイベントの運営者だけが編集できます。変更は反映していません。
              </EmptyPanel>
            )}
          </FocusOnMount>
        </ManageBody>
      </Page>
    );
  }

  if (outcome !== null) {
    const done = {
      saved: {
        title: "参加内容を保存しました",
        body: !occasionViewable
          ? `添えた掲載と参加日を保存しました。${shownLater}`
          : side === "place"
            ? `${eventName}のイベントページに、添えた掲載と参加日を反映しました。`
            : `${shopName}の添えた掲載と参加日を、イベントページに反映しました。`,
      },
      added: {
        title: "参加店舗に追加しました",
        body: occasionViewable
          ? `${shopName}を、${eventName}の参加店舗としてイベントページに反映しました。`
          : `${shopName}を、${eventName}の参加店舗に追加しました。${shownLater}`,
      },
      withdrawn: {
        title: "参加を取りやめました",
        body: `${shopName}は、${eventName}の参加店舗から外れました。`,
      },
    }[outcome.kind];
    return (
      <Page heading={heading}>
        <FocusOnMount>
          <DonePanel
            title={done.title}
            actions={
              <>
                {backToList}
                {eventLink}
              </>
            }
          >
            {done.body}
          </DonePanel>
        </FocusOnMount>
      </Page>
    );
  }

  const known = new Map<string, AttachedListingItem>(
    (data.participation?.listings ?? []).map((listing) => [
      listing.id,
      listing,
    ]),
  );
  const attachable = new Map(data.attachable.map((item) => [item.id, item]));
  const candidates = data.attachable.filter(
    (item) => !values.listingIds.includes(item.id),
  );
  const savedDates = new Set(data.participation?.dates ?? []);
  const leftOutside = values.dates.filter(
    (date) => savedDates.has(date) && !inPeriod(date, period),
  );
  const cannotSave = stewardArrived || alreadyParticipating;
  const submitLabel = mode === "add" ? "参加店舗として追加" : "参加内容を保存";

  return (
    <Page
      heading={heading}
      actions={
        <Button type="submit" form="cm04-form" disabled={busy || cannotSave}>
          {busy ? "保存しています…" : submitLabel}
        </Button>
      }
      {...(dirty && !cannotSave
        ? {
            actionsNote:
              "保存していない変更があります。保存せずに画面を離れると、変更は残りません。",
          }
        : {})}
    >
      <form
        className="m-body"
        id="cm04-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!cannotSave) save();
        }}
      >
        {failure !== null || stewardArrived || alreadyParticipating ? (
          <div ref={alertRef} tabIndex={-1} className="outline-none">
            <FailureAlert
              failure={failure}
              mode={mode}
              proxy={proxy}
              busy={busy}
              shopName={shopName}
              occasionId={occasion.id}
              placeId={data.place.id}
              onReload={() =>
                startBusy(async () => {
                  setDraft(reloadDraft);
                  await reconcile();
                  setFailure(null);
                })
              }
              onRetry={save}
            />
            {stewardArrived && failure === null ? (
              <StewardArrived mode={mode} shopName={shopName} params={params} />
            ) : null}
            {alreadyParticipating && failure === null ? (
              <Alert
                title={`${shopName}は、すでに参加しています`}
                actions={
                  <ButtonLink
                    variant="secondary"
                    to="/manage/events/$occasionId/participants/$placeId"
                    params={{ ...params, placeId: data.place.id }}
                  >
                    参加内容を変更する
                  </ButtonLink>
                }
              >
                参加店舗として追加していません。参加内容の変更へ進めます。
              </Alert>
            ) : null}
          </div>
        ) : null}
        {side === "place" && !occasionViewable ? (
          <div role="status">
            <Notice
              variant="manage"
              tone="paper"
              title="このイベントは閲覧者に表示されていません"
            >
              {occasion.suspended
                ? "サービス運営者がイベントを非公開にしています。解除されるまで、参加店舗と添えた掲載はイベントページに表示されません。参加内容の変更と取りやめは、これまでどおり行えます。"
                : "イベントが公開されていないため、参加店舗と添えた掲載はイベントページに表示されません。参加内容の変更と取りやめは、これまでどおり行えます。"}
            </Notice>
          </div>
        ) : null}
        {leftOutside.length > 0 ? (
          <div role="status">
            <Notice
              variant="manage"
              tone="paper"
              title="開催期間の外の参加日があります"
            >
              {`開催期間は${period === null ? "決まっていません" : periodText(period)}です。開催期間の外になった参加日は、閲覧者に表示されていません。外してから保存できます。`}
            </Notice>
          </div>
        ) : null}

        <section className="m-section" aria-labelledby="cm04-join">
          <SectionTitle variant="manage" id="cm04-join">
            参加
          </SectionTitle>
          <div className="em-sub">
            <p className="m-field__label">イベント</p>
            <RowLink
              to={occasionPagePath(occasion.id)}
              photo={photoOf(occasion.photoUrl)}
              name={eventName}
              meta={period === null ? "開催期間は未設定" : periodText(period)}
              sub={<OccasionBadges occasion={occasion} />}
            />
          </div>
          <div className="em-sub">
            <p className="m-field__label">店舗</p>
            <div className="cm04-item">
              <RowLink
                to={placePagePath(data.place.id)}
                photo={photoOf(data.place.photoUrl)}
                name={shopName}
                meta={
                  data.place.operatingStatus === null
                    ? "閲覧者に表示されていない店舗"
                    : OPERATING_STATUS_LABEL[data.place.operatingStatus]
                }
                {...(side === "occasion"
                  ? {
                      sub: stewardArrived
                        ? "店舗管理者のいる店舗"
                        : "管理者のいない店舗",
                    }
                  : {})}
              />
              {mode === "add" ? (
                <ChipLink
                  to="/manage/events/$occasionId/participants/new"
                  params={params}
                  search={{}}
                >
                  選び直す
                </ChipLink>
              ) : null}
            </div>
            {side === "occasion" && mode === "edit" ? (
              <p className="m-field__help">
                {stewardArrived
                  ? "店舗管理者のいる参加店舗です。参加内容は、店舗管理者が変更します。イベントの運営者は変更できません。"
                  : "店舗管理者のいない参加店舗です。参加内容は、イベントの運営者が変更できます。参加店舗から外すときは、参加店舗と申請で除外します。"}
              </p>
            ) : null}
          </div>
        </section>

        <section className="m-section" aria-labelledby="cm04-listings">
          <SectionTitle variant="manage" id="cm04-listings">
            添える掲載
          </SectionTitle>
          <p className="m-field__help">
            店舗の公開中の掲載から選びます。提供状態は問いません。掲載は複数添えられ、添えなくても参加できます。
          </p>
          {values.listingIds.length === 0 ? (
            <p className="m-field__help">
              {mode === "add"
                ? "まだ添えた掲載はありません。添えずに追加することもできます。"
                : "添えた掲載はありません。"}
            </p>
          ) : (
            <ul className="cm04-items">
              {values.listingIds.map((id) => (
                <AttachedRow
                  key={id}
                  id={id}
                  stored={known.get(id) ?? null}
                  candidate={attachable.get(id) ?? null}
                  pickedName={picked.get(id) ?? null}
                  disabled={busy || cannotSave}
                  onRemove={() =>
                    change({
                      listingIds: values.listingIds.filter(
                        (listed) => listed !== id,
                      ),
                    })
                  }
                />
              ))}
            </ul>
          )}
          <div className="em-sub">
            <p className="m-field__label">追加できる掲載</p>
            {candidates.length === 0 ? (
              <p className="m-field__help">
                追加できる掲載は、ほかにありません。
              </p>
            ) : (
              <ul className="cm04-items">
                {candidates.map((item) => {
                  const name = item.name ?? "名称未設定";
                  return (
                    <li key={item.id} className="cm04-item">
                      <RowLink
                        to={listingPagePath(item.id)}
                        photo={photoOf(item.photoUrl)}
                        name={name}
                        {...listingMeta(item.offeringStatus)}
                        sub={<OfferingBadge status={item.offeringStatus} />}
                      />
                      <ChipButton
                        disabled={busy || cannotSave}
                        aria-label={`${name}を添える`}
                        onClick={() => {
                          setPicked((current) =>
                            new Map(current).set(item.id, item.name),
                          );
                          change({
                            listingIds: [...values.listingIds, item.id],
                          });
                        }}
                      >
                        添える
                      </ChipButton>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="m-field__help">
              下書き・一時非公開・運営による非公開の掲載は、候補に出ません。
            </p>
          </div>
        </section>

        <section className="m-section" aria-labelledby="cm04-dates">
          <SectionTitle variant="manage" id="cm04-dates">
            参加日
          </SectionTitle>
          {values.dates.length === 0 ? (
            <p className="m-field__help">
              {mode === "add"
                ? "まだ参加日はありません。添えずに追加することもできます。"
                : "参加日はありません。"}
            </p>
          ) : (
            <LinkList>
              {values.dates.map((date) => {
                const out = !inPeriod(date, period);
                const saved = savedDates.has(date);
                return (
                  <li key={date} className="m-list__item cm04-date">
                    <span className="m-list__text">
                      <span className="m-list__title">
                        {jpDateWithWeekday(date)}
                      </span>
                      {out ? (
                        <>
                          <Badge tone="alert">開催期間の外</Badge>
                          <span className="m-list__meta">
                            {saved
                              ? "閲覧者に表示されていません。外してから保存してください"
                              : "このままでは保存できません。外してください"}
                          </span>
                        </>
                      ) : null}
                    </span>
                    <ChipButton
                      disabled={busy || cannotSave}
                      aria-label={`${jpDate(date)}を外す`}
                      onClick={() => {
                        const rest = values.dates.filter((d) => d !== date);
                        change({ dates: rest });
                        if (rest.every((d) => inPeriod(d, period))) {
                          setDateError(null);
                        }
                      }}
                    >
                      外す
                    </ChipButton>
                  </li>
                );
              })}
            </LinkList>
          )}
          <Field
            id="cm04-date"
            label="参加日を追加"
            requirement="optional"
            help={
              period === null
                ? "開催期間が決まると、参加日を添えられます。"
                : `開催期間（${periodText(period)}）の日付から選びます。参加日は複数添えられ、添えなくても参加できます。`
            }
            {...(dateError === null ? {} : { error: dateError })}
          >
            {(control) => (
              <div className="m-inline">
                <Input
                  {...control}
                  type="date"
                  value={newDate}
                  disabled={busy || cannotSave}
                  onChange={(event) => setNewDate(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addDate();
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  disabled={busy || cannotSave}
                  onClick={addDate}
                >
                  追加
                </Button>
              </div>
            )}
          </Field>
        </section>

        {occasionViewable ? (
          <section className="m-section" aria-labelledby="cm04-pages">
            <SectionTitle variant="manage" id="cm04-pages">
              閲覧者への見え方
            </SectionTitle>
            <LinkList>
              <li>
                <ListRowLink
                  to={occasionPagePath(occasion.id)}
                  title="閲覧者に見えるイベントページ"
                  meta="保存した参加内容は、参加店舗としてすぐに反映します"
                />
              </li>
            </LinkList>
            <p className="m-field__help">
              承認を求めず、保存した時点で反映します。
            </p>
          </section>
        ) : null}

        {side === "place" ? (
          <section className="m-section cm04-withdraw" aria-labelledby="cm04-w">
            <hr className="m-divider" />
            <SectionTitle variant="manage" id="cm04-w">
              参加の取りやめ
            </SectionTitle>
            <p className="m-field__help">
              {`取りやめると、${shopName}はこのイベントの参加店舗から外れます。承認は要りません。`}
            </p>
            <div>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                参加を取りやめる
              </Button>
            </div>
          </section>
        ) : null}
      </form>

      <ConfirmDialog
        open={confirming}
        title="参加を取りやめますか"
        confirmLabel="取りやめる"
        pending={busy}
        onConfirm={withdraw}
        onCancel={() => setConfirming(false)}
      >
        <p>確定すると、すぐに閲覧者への表示が変わります。</p>
        <ul>
          <li>{`${shopName}は、${eventName}の参加店舗から外れます`}</li>
          <li>
            イベントページと参加店舗マップに、この店舗と添えた掲載が表示されなくなります
          </li>
          <li>もう一度参加するときは、参加を申請して承認を受けます</li>
        </ul>
      </ConfirmDialog>
    </Page>
  );
}

function OccasionBadges({
  occasion,
}: {
  occasion: ParticipationEditorData["occasion"];
}) {
  return (
    <span className="p-badges">
      {occasion.holding === null ? null : (
        <Badge
          tone={
            occasion.holding === "cancelled"
              ? "alert"
              : occasion.holding === "ended"
                ? "muted"
                : "accent"
          }
        >
          {HOLDING_LABEL[occasion.holding]}
        </Badge>
      )}
      {occasion.suspended ? (
        <Badge tone="alert">運営による非公開</Badge>
      ) : occasion.publication.status === "published" ? null : (
        <Badge>{occasionPublicationLabel(occasion.publication)}</Badge>
      )}
    </span>
  );
}

const photoOf = (url: string | null) =>
  url === null ? null : { src: url, alt: "" };

function AttachedRow({
  id,
  stored,
  candidate,
  pickedName,
  disabled,
  onRemove,
}: {
  id: string;
  /** As saved in the participation, when it was. */
  stored: AttachedListingItem | null;
  /** As an attachable listing, when it is one now. */
  candidate: Readonly<{
    name: string | null;
    photoUrl: string | null;
    offeringStatus: OfferingStatus;
  }> | null;
  /** The name it had when attached in this form, before the save. */
  pickedName: string | null;
  disabled: boolean;
  onRemove: () => void;
}) {
  const remove = (name: string) => (
    <ChipButton
      disabled={disabled}
      aria-label={`${name}を外す`}
      onClick={onRemove}
    >
      外す
    </ChipButton>
  );
  if (stored === null) {
    if (candidate === null) {
      const name = pickedName ?? "名称未設定";
      return (
        <li className="cm04-item">
          <Row
            photo={null}
            name={name}
            sub={
              <span className="p-badges">
                <Badge tone="alert">添えられません</Badge>
              </span>
            }
            meta="外してから保存してください"
          />
          {remove(name)}
        </li>
      );
    }
    const name = candidate.name ?? "名称未設定";
    return (
      <li className="cm04-item">
        <RowLink
          to={listingPagePath(id)}
          photo={photoOf(candidate.photoUrl)}
          name={name}
          {...listingMeta(candidate.offeringStatus)}
          sub={
            <span className="p-badges">
              <OfferingBadge status={candidate.offeringStatus} />
              <Badge tone="accent">保存前に追加</Badge>
            </span>
          }
        />
        {remove(name)}
      </li>
    );
  }
  if (stored.deleted) {
    return (
      <li className="cm04-item">
        <Row
          photo={null}
          name="削除された掲載"
          meta="閲覧者に表示されていません"
        />
        {remove("削除された掲載")}
      </li>
    );
  }
  const name = stored.name ?? "名称未設定";
  const state = attachedListingState(stored);
  return (
    <li className="cm04-item">
      {state.hidden ? (
        <RowLink
          to={listingPagePath(id)}
          photo={photoOf(stored.photoUrl)}
          name={name}
          meta="閲覧者に表示されていません"
          sub={
            <span className="p-badges">
              <Badge tone="alert">{state.label}</Badge>
            </span>
          }
        />
      ) : (
        <RowLink
          to={listingPagePath(id)}
          photo={photoOf(stored.photoUrl)}
          name={name}
          {...listingMeta(stored.offeringStatus)}
          sub={
            <span className="p-badges">
              <OfferingBadge status={stored.offeringStatus} />
            </span>
          }
        />
      )}
      {remove(name)}
    </li>
  );
}

function StewardArrived({
  mode,
  shopName,
  params,
}: {
  mode: Mode;
  shopName: string;
  params: Readonly<{ occasionId: string }>;
}) {
  return (
    <Alert
      title={`${shopName}に店舗管理者が就きました`}
      actions={
        <ButtonLink
          variant="secondary"
          to="/manage/events/$occasionId"
          params={params}
        >
          参加店舗と申請へ戻る
        </ButtonLink>
      }
    >
      {mode === "add"
        ? "イベントの運営者は、この店舗を参加店舗として追加できません。追加は反映していません。参加は、店舗管理者からの参加の申請を待ちます。"
        : "イベントの運営者は、この店舗の参加内容を変更できません。変更は保存していません。参加は続いていて、これからの変更は店舗管理者が行います。"}
    </Alert>
  );
}

function FailureAlert({
  failure,
  mode,
  proxy,
  busy,
  shopName,
  occasionId,
  placeId,
  onReload,
  onRetry,
}: {
  failure: Failure | null;
  mode: Mode;
  proxy: boolean;
  busy: boolean;
  shopName: string;
  occasionId: string;
  placeId: string;
  onReload: () => void;
  onRetry: () => void;
}) {
  if (failure === null) return null;
  const { state, attempt } = failure;
  const params = { occasionId };
  if (state.kind === "forbidden" && proxy) {
    return (
      <ProxyUnavailablePanel occasionId={occasionId}>
        このイベントにはイベント運営者が就きました。変更は保存していません。イベントの運営の画面で、運営者がいることを確かめてください。
      </ProxyUnavailablePanel>
    );
  }
  switch (state.code) {
    case "OCCASION_PLACE_HAS_STEWARD":
      return <StewardArrived mode={mode} shopName={shopName} params={params} />;
    case "OCCASION_ALREADY_PARTICIPATING":
      return (
        <Alert
          title={`${shopName}は、すでに参加しています`}
          actions={
            <ButtonLink
              variant="secondary"
              to="/manage/events/$occasionId/participants/$placeId"
              params={{ ...params, placeId }}
            >
              参加内容を変更する
            </ButtonLink>
          }
        >
          別の運営者か承認で、先に参加が成立していました。参加店舗として追加していません。
        </Alert>
      );
    case "OCCASION_PLACE_NOT_VIEWABLE":
    case "PLACE_NOT_FOUND":
      return (
        <Alert
          title="選んだ店舗は閲覧できません"
          actions={
            <ButtonLink
              variant="secondary"
              to="/manage/events/$occasionId/participants/new"
              params={params}
              search={{}}
            >
              別の店舗を選ぶ
            </ButtonLink>
          }
        >
          参加店舗として追加していません。別の店舗を選んでください。
        </Alert>
      );
    case "OCCASION_LISTING_NOT_ATTACHABLE":
      return (
        <Alert title="添えられない掲載があります">
          新たに添えた掲載のうち、公開中でなくなったものがあるため、参加内容は保存していません。「添えられません」の掲載を外すか、最新の追加できる掲載から選び直して、もう一度保存してください。
        </Alert>
      );
    default:
      break;
  }
  if (state.kind === "conflict") {
    return (
      <Alert
        title="ほかの人が先に参加内容を保存していました"
        actions={
          <Button variant="secondary" disabled={busy} onClick={onReload}>
            最新の内容を読み直す
          </Button>
        }
      >
        この変更は保存していません。最新の参加内容を読み直してから、もう一度変更してください。
      </Alert>
    );
  }
  if (state.kind === "invalidInput") {
    return (
      <Alert
        title={
          attempt === "add"
            ? "参加店舗として追加できませんでした"
            : state.code === "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD"
              ? "参加日を保存できませんでした"
              : "保存できませんでした"
        }
        {...(state.code === "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD"
          ? {
              list: (
                <li>
                  <a className="text-button" href="#cm04-date">
                    参加日
                  </a>
                </li>
              ),
            }
          : {})}
      >
        {state.code === "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD"
          ? "参加日は、開催期間の中の日付に限ります。開催期間の外の参加日を外してください。"
          : state.message}
      </Alert>
    );
  }
  if (state.kind === "premiseChanged" || state.kind === "notFound") {
    return (
      <Alert title="操作を反映できませんでした">
        {`${state.message}。現在の状態を示しています。`}
      </Alert>
    );
  }
  return (
    <Alert
      title={
        attempt === "withdraw"
          ? "参加を取りやめられませんでした"
          : attempt === "add"
            ? "追加できませんでした"
            : "保存できませんでした"
      }
      {...(attempt === "withdraw"
        ? {}
        : {
            actions: (
              <Button variant="secondary" disabled={busy} onClick={onRetry}>
                {attempt === "add" ? "もう一度追加" : "もう一度保存"}
              </Button>
            ),
          })}
    >
      {state.kind === "failed"
        ? "通信を確かめて、もう一度お試しください。入力した内容は残っています。"
        : state.message}
    </Alert>
  );
}
