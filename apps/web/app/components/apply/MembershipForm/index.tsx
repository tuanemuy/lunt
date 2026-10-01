"use client";

import { useRouter } from "@tanstack/react-router";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { ManageBody, ManagePage } from "@/components/layout/ManageShell";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { DonePanel } from "@/components/ui/DonePanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { HydrationGate } from "@/components/ui/HydrationGate";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import { TextButton, TextLink } from "@/components/ui/TextButton";
import { STATUS_LABEL, STATUS_TONE } from "@/presentation/applicationWords";
import { resubmitApplicationFn } from "@/presentation/apply";
import {
  APPLICATION_ID_CONFLICT,
  INPUT_ERROR,
  replyError,
  replyOf,
} from "@/presentation/applyForm";
import {
  checkMembershipFn,
  findMembershipPlacesFn,
  findMembershipRegionsFn,
  listMyApplicationsAboutPlaceFn,
  submitAffiliationChangeFn,
} from "@/presentation/applyRelations";
import {
  affiliationStatusPath,
  type CandidateRefusal,
  MEMBERSHIP_KIND_LABEL,
  type MembershipFormData,
  type MembershipKind,
  type MyActiveApplicationItem,
  type PlaceOption,
  type RegionOption,
  type RelationRefusal,
} from "@/presentation/applyRelationsView";
import { applicationPath } from "@/presentation/applyView";
import { useEntryDraft } from "@/presentation/entryDraft";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import {
  membershipDraftSchema,
  type SearchSnapshot,
} from "@/presentation/membershipDraft";
import { newId } from "@/presentation/newId";
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
import {
  CandidateRadios,
  KeywordSearch,
  type RadioCandidate,
  RelationRefused,
  TargetRow,
} from "../RelationParts";

/** The codes a submission is refused with for a reason of 「受け付けない事情」. */
const REFUSED_CODES: ReadonlySet<string> = new Set([
  "APPLICATION_PLACE_HAS_STEWARD",
  "APPLICATION_PLACE_HAS_NO_STEWARD",
  "APPLICATION_ALREADY_AFFILIATED",
  "APPLICATION_NOT_AFFILIATED",
  "APPLICATION_TARGET_NOT_VIEWABLE",
  "APPLICATION_ALREADY_ACTIVE",
]);

type Errors = Readonly<{
  place?: string | undefined;
  region?: string | undefined;
  reply?: string | undefined;
}>;

const regionHref = (region: RegionOption): string | null =>
  region.viewable ? `/regions/${encodeURIComponent(region.regionId)}` : null;

const placeHref = (place: PlaceOption): string | null =>
  place.viewable ? `/places/${encodeURIComponent(place.placeId)}` : null;

const regionCandidate = (region: RegionOption): RadioCandidate => ({
  id: region.regionId,
  name: region.name,
  meta: region.meta,
  photoUrl: region.photoUrl,
  badges: region.badges,
  refusal: region.refusal,
  detailHref: regionHref(region),
});

/** A store candidate; its refusal is about the region the entry chose, so it shows only while that region is chosen. */
const placeCandidate =
  (judged: boolean) =>
  (place: PlaceOption): RadioCandidate => ({
    id: place.placeId,
    name: place.name,
    meta: place.meta,
    photoUrl: place.photoUrl,
    refusal: judged ? place.refusal : null,
    detailHref: placeHref(place),
  });

function fieldLinks(errors: Errors, regionLabel: string): readonly FieldLink[] {
  return [
    ...(errors.place === undefined
      ? []
      : [{ anchor: "rq05-place", label: "申請する店舗" }]),
    ...(errors.region === undefined
      ? []
      : [{ anchor: "rq05-region", label: regionLabel }]),
    ...(errors.reply === undefined
      ? []
      : [{ anchor: "apply-reply", label: "追加の確認への回答" }]),
  ];
}

/**
 * REG-03: what the viewer has already applied for about the store, as an
 * individual and still in progress, each opening its MY-05 — to check
 * before applying again.
 */
function MyActiveApplications({
  placeName,
  items,
}: {
  placeName: string;
  items: readonly MyActiveApplicationItem[];
}) {
  return (
    <div className="m-field">
      <p className="m-field__label">{`${placeName}について出している申請`}</p>
      <LinkList>
        {items.map((item) => (
          <li key={item.applicationId}>
            <ListRowLink
              to="/me/applications/$applicationId"
              params={{ applicationId: item.applicationId }}
              title={item.title}
              meta="申請を見る"
              end={
                <Badge tone={STATUS_TONE[item.status]}>
                  {STATUS_LABEL[item.status]}
                </Badge>
              }
            />
          </li>
        ))}
      </LinkList>
      <p className="m-field__help">
        確認中・差し戻しの申請です。重ねて申請する前に、申請の詳細で状況を確かめられます。
      </p>
    </div>
  );
}

/**
 * RQ-05 所属・離脱の申請 (REG-01〜REG-03, APP-02, APP-04): the store — its
 * steward applies as the store, anyone else as an individual for a store
 * without a steward — the kind, and the region: for 所属 a published one
 * found by keyword (CF-02), for 離脱 one of the store's affiliations (a
 * steward also sees the hidden ones with their state). Candidates that
 * cannot be chosen show why. Opened from DT-03 the region is fixed and
 * the store is chosen here: a managed one, or a store without a steward
 * found by keyword. Also the resubmission (only a reply) and the
 * reapplication.
 */
export function MembershipForm({ data }: { data: MembershipFormData }) {
  const router = useRouter();
  const reconcile = useReconcile();
  const { mode } = data;
  const resubmit = mode.kind === "resubmit" ? mode : null;
  const fromRegion = data.opening === "region";
  const preset = data.region;

  const [place, setPlace] = useState<PlaceOption | null>(data.place);
  const [kind, setKind] = useState<MembershipKind>(data.kind);
  // The region the entry chose, for the kind: a region to leave is one of
  // the store's affiliations and starts chosen only when it can be chosen;
  // a region to join is shown with its reason when it cannot (DT-03). The
  // preset was judged for `data.kind` only, so the other kind starts with
  // no region and judges its choice by its own rules.
  const startRegion = (of: MembershipKind): RegionOption | null => {
    if (preset === null) return null;
    if (resubmit !== null) return preset;
    const listed = data.affiliated.find(
      (item) => item.regionId === preset.regionId,
    );
    if (of === "leave") {
      return listed !== undefined && listed.refusal === null ? listed : null;
    }
    return listed === undefined && data.kind === "affiliation" ? preset : null;
  };
  const [region, setRegion] = useState<RegionOption | null>(() =>
    startRegion(data.kind),
  );
  const [picking, setPicking] = useState(false);
  // The viewer's applications in progress about the store, as an
  // individual: read with the screen for the store the entry names, and
  // for a store chosen here (DT-03).
  const [mine, setMine] = useState<
    Readonly<{
      placeId: string | null;
      items: readonly MyActiveApplicationItem[];
    }>
  >({ placeId: data.place?.placeId ?? null, items: data.mine });
  const [reply, setReply] = useState("");
  const [stage, setStage] = useState<"input" | "review">("input");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const [refusal, setRefusal] = useState<RelationRefusal | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  useScrollTopOn(`${stage}:${done === null}:${refusal === null}`);
  const attempt = useRef<{ id: string; key: string } | null>(null);
  // CF-02: the input survives a visit to a candidate's detail and back.
  const regionSearch = useRef<SearchSnapshot<RegionOption> | null>(null);
  const placeSearch = useRef<SearchSnapshot<PlaceOption> | null>(null);
  const [restored, setRestored] = useState<
    Readonly<{
      count: number;
      regionFor: string | null;
      region: SearchSnapshot<RegionOption> | null;
      place: SearchSnapshot<PlaceOption> | null;
    }>
  >({ count: 0, regionFor: null, region: null, place: null });
  const draft = useEntryDraft("rq05", membershipDraftSchema, (kept) => {
    setPlace(kept.place);
    setKind(kept.kind);
    setRegion(kept.region);
    setPicking(kept.picking);
    setReply(kept.reply);
    setRestored((current) => ({
      count: current.count + 1,
      regionFor: kept.place?.placeId ?? null,
      region: kept.regionSearch,
      place: kept.placeSearch,
    }));
  });
  const keepRegionSearch = useCallback(
    (snapshot: SearchSnapshot<RegionOption>) => {
      regionSearch.current = snapshot;
    },
    [],
  );
  const keepPlaceSearch = useCallback(
    (snapshot: SearchSnapshot<PlaceOption>) => {
      placeSearch.current = snapshot;
    },
    [],
  );
  const stashOnLeave = (event: MouseEvent<HTMLFormElement>) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("a[href]") === null) return;
    draft.stash({
      place,
      kind,
      region,
      picking,
      reply,
      regionSearch: regionSearch.current,
      placeSearch: placeSearch.current,
    });
  };

  const individualPlace =
    resubmit === null && place?.actingAs === "individual"
      ? place.placeId
      : null;
  useEffect(() => {
    if (individualPlace === null || individualPlace === mine.placeId) return;
    let live = true;
    listMyApplicationsAboutPlaceFn({ data: { placeId: individualPlace } })
      .then((items) => {
        if (live) setMine({ placeId: individualPlace, items });
      })
      .catch(() => {
        // Only a help for checking: applying still refuses a duplicate.
        if (live) setMine({ placeId: individualPlace, items: [] });
      });
    return () => {
      live = false;
    };
  }, [individualPlace, mine.placeId]);
  const mineShown =
    individualPlace !== null && individualPlace === mine.placeId
      ? mine.items
      : [];

  const kindLabel = MEMBERSHIP_KIND_LABEL[kind];
  const regionLabel = kind === "leave" ? "離脱する地域" : "所属する地域";
  const steward = place?.actingAs === "steward";
  const placeName = place?.name ?? "";
  // The preset region was judged for each store (DT-03); another region
  // was judged for the store it was found for.
  const onPreset = region === null || region.regionId === preset?.regionId;
  const regionRefusal: CandidateRefusal | null =
    region === null
      ? null
      : fromRegion && region.regionId === preset?.regionId
        ? (place?.refusal ?? null)
        : region.refusal;
  const dirty =
    resubmit !== null
      ? reply !== ""
      : place?.placeId !== data.place?.placeId ||
        kind !== data.kind ||
        region?.regionId !== (preset?.regionId ?? undefined);
  const heading =
    resubmit !== null
      ? `${MEMBERSHIP_KIND_LABEL[data.kind]}の申請を再提出`
      : fromRegion
        ? "所属を申請"
        : data.place?.actingAs === "steward"
          ? `${kindLabel}を申請`
          : "所属・離脱を申請";
  const title = <ApplyTitle heading={heading} />;

  const fail = (failed: ErrorState, next: Errors) => {
    setErrors(next);
    setFailure({
      kind: "error",
      state: failed,
      fields: fieldLinks(next, regionLabel),
    });
    setStage("input");
  };

  const check = () => {
    const missing: { place?: string; region?: string } = {};
    if (place === null) missing.place = "申請する店舗を選んでください";
    if (region === null) missing.region = `${regionLabel}を選んでください`;
    else if (regionRefusal !== null) {
      missing.region = `${region.name}は選べません。${regionRefusal.reason}`;
    }
    if (Object.keys(missing).length > 0) {
      fail(INPUT_ERROR, missing);
      return;
    }
    setErrors({});
    setFailure(null);
    if (resubmit === null) setStage("review");
    else send();
  };

  const target =
    place === null || region === null
      ? null
      : {
          kind,
          actingAs: place.actingAs,
          placeId: place.placeId,
          regionId: region.regionId,
        };

  const send = () =>
    startSend(async () => {
      if (target === null) return;
      try {
        if (resubmit !== null) {
          const result = await resubmitApplicationFn({
            data: {
              applicationId: resubmit.applicationId,
              version: resubmit.version,
              amended: { kind: data.kind },
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
        const key = JSON.stringify(target);
        if (attempt.current?.key !== key) {
          attempt.current = { id: newId(), key };
        }
        const { applicationId } = await submitAffiliationChangeFn({
          data: { applicationId: attempt.current.id, ...target },
        });
        attempt.current = null;
        // Not reloaded here: its eligibility would now refuse the region.
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
        if (
          resubmit === null &&
          (failed.kind === "forbidden" ||
            (failed.kind === "premiseChanged" &&
              failed.code !== null &&
              REFUSED_CODES.has(failed.code)))
        ) {
          try {
            const refused = await checkMembershipFn({ data: target });
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

  if (refusal !== null) {
    const chooseAgain =
      refusal.kind === "affiliated" || refusal.kind === "targetUnavailable"
        ? () => {
            setRefusal(null);
            setStage("input");
            setRegion(null);
            setPicking(true);
          }
        : undefined;
    return chooseAgain === undefined ? (
      <KeepOutcome
        view={
          <RelationRefused
            heading={heading}
            refusal={refusal}
            what="membership"
          />
        }
      />
    ) : (
      <RelationRefused
        heading={heading}
        refusal={refusal}
        what="membership"
        onChooseAgain={chooseAgain}
      />
    );
  }

  if (done !== null) {
    const doneRegion = region?.name ?? preset?.name ?? "";
    const words = MEMBERSHIP_KIND_LABEL[resubmit === null ? kind : data.kind];
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
                    {place === null ? null : steward ? (
                      <ButtonLink
                        variant="secondary"
                        to={affiliationStatusPath(place.placeId)}
                      >
                        所属地域の状況へ
                      </ButtonLink>
                    ) : (
                      <ButtonLink
                        variant="secondary"
                        to="/places/$placeId"
                        params={{ placeId: place.placeId }}
                      >
                        店舗ページへ戻る
                      </ButtonLink>
                    )}
                  </>
                }
              >
                {resubmit === null
                  ? `${placeName}の${doneRegion}${kind === "leave" ? "からの" : "への"}${words}の申請は、確認中になりました。地域の運営者が確かめて、結果を通知します。${steward ? "所属地域の状況にも、申請中として表示されます。" : ""}${kind === "leave" ? "承認されるまで、所属は続きます。" : ""}`
                  : "申請は確認中に戻りました。地域の運営者が確かめた結果は、通知でお知らせします。"}
              </DonePanel>
            </FocusOnMount>
          </ManagePage>
        }
      />
    );
  }

  const cancel =
    resubmit !== null ? (
      <ButtonLink
        variant="secondary"
        to={applicationPath(resubmit.applicationId)}
      >
        やめる
      </ButtonLink>
    ) : fromRegion && preset !== null ? (
      <ButtonLink
        variant="secondary"
        to="/regions/$regionId"
        params={{ regionId: preset.regionId }}
      >
        やめる
      </ButtonLink>
    ) : data.place?.actingAs === "steward" ? (
      <ButtonLink
        variant="secondary"
        to={affiliationStatusPath(data.place.placeId)}
      >
        やめる
      </ButtonLink>
    ) : data.place !== null ? (
      <ButtonLink
        variant="secondary"
        to="/places/$placeId"
        params={{ placeId: data.place.placeId }}
      >
        やめる
      </ButtonLink>
    ) : (
      <ButtonLink variant="secondary" to="/me">
        やめる
      </ButtonLink>
    );

  if (stage === "review" && place !== null && region !== null) {
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
              {`次の内容で、${kindLabel}の申請を提出します。提出すると申請は確認中になり、提出の後はこの画面で直せません。`}
            </p>
            <ReviewList
              items={[
                {
                  term: "申請者",
                  value: steward
                    ? `店舗管理者として（${place.name}）`
                    : "個人として",
                },
                {
                  term: "申請する店舗",
                  value:
                    place.address === ""
                      ? place.name
                      : `${place.name}（${place.address}）`,
                },
                { term: "申請の種類", value: kindLabel },
                { term: regionLabel, value: region.name },
              ]}
            />
            <Notice
              variant="manage"
              tone="paper"
              title={kind === "leave" ? "承認されるまで" : "承認されると"}
            >
              {kind === "leave"
                ? `地域の運営者が確かめます。承認されるまで、${place.name}は${region.name}に所属したままです。承認されると、所属が解除されます。`
                : `地域の運営者が確かめます。承認されると、${place.name}は${region.name}に所属し、地域の店舗として表示されます。`}
            </Notice>
          </ManageBody>
        </FocusOnMount>
      </ManagePage>
    );
  }

  const chooseKind = (next: MembershipKind) => {
    setKind(next);
    setErrors({});
    setPicking(false);
    setRegion(startRegion(next));
  };

  const choosePlace = (next: PlaceOption) => {
    setPlace(next);
    setErrors((current) => ({ ...current, place: undefined }));
    if (region !== null && region.regionId !== preset?.regionId) {
      // A region found for another store was judged for that store.
      setRegion(preset);
      setPicking(false);
    }
  };

  const leaveChoices = data.affiliated;
  const canLeave = leaveChoices.length > 0;
  const joinSearch =
    place === null ? null : (
      <KeywordSearch<RegionOption>
        key={`${place.placeId}:${restored.count}`}
        initial={restored.regionFor === place.placeId ? restored.region : null}
        keep={keepRegionSearch}
        label="地域をキーワードで探す"
        placeholder="地域名・まちの名前で探す"
        disabled={sending}
        search={async (keyword) =>
          (
            await findMembershipRegionsFn({
              data: {
                placeId: place.placeId,
                actingAs: place.actingAs,
                keyword,
              },
            })
          ).items
        }
      >
        {(items) => (
          <CandidateRadios
            name="rq05-region-found"
            items={items.map(regionCandidate)}
            // A refused region is not chosen: finding it again (judged
            // afresh for this store and kind) must be able to choose it.
            value={
              region === null || regionRefusal !== null ? null : region.regionId
            }
            disabled={sending}
            invalid={errors.region !== undefined}
            onChange={(id) => {
              const found = items.find((item) => item.regionId === id);
              if (found === undefined) return;
              setRegion(found);
              setPicking(false);
              setErrors((current) => ({ ...current, region: undefined }));
            }}
          />
        )}
      </KeywordSearch>
    );

  return (
    <ManagePage
      title={title}
      actions={
        <>
          <Button
            type="submit"
            form="rq05-form"
            disabled={sending || failure?.kind === "lapsed"}
          >
            {resubmit === null
              ? "入力内容を確かめる"
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
              ? "再提出していない回答があります。再提出せずに画面を離れると、回答は残らず、申請は差し戻しのまま変わりません。"
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
        id="rq05-form"
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
              busy={sending}
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
          <ModeNotice mode={mode} reapplied="店舗・地域・種類" />

          <div className="m-field">
            <p className="m-field__label">申請者</p>
            {place === null ? (
              <p className="m-field__help">
                申請者は、選んだ店舗で決まります。管理する店舗は店舗管理者として、管理者のいない店舗は個人として申請します。
              </p>
            ) : (
              <>
                <p className="rq05-applicant">
                  {steward ? (
                    <>
                      <Badge tone="accent">店舗管理者として</Badge>
                      <span>{place.name}</span>
                    </>
                  ) : (
                    <>
                      <Badge>個人として</Badge>
                      <span>
                        店舗に管理者がいないため、個人として申請します。
                      </span>
                    </>
                  )}
                </p>
                {fromRegion ? (
                  <p className="m-field__help">
                    申請者は、選んだ店舗で決まります。管理する店舗は店舗管理者として、管理者のいない店舗は個人として申請します。
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="m-field" id="rq05-place">
            <p className="m-field__label" id="rq05-place-label">
              申請する店舗
            </p>
            {fromRegion && resubmit === null ? (
              <div className="rq05-search">
                {data.managed.length === 0 ? null : (
                  <>
                    <p className="rq05-caption">
                      管理する店舗（店舗管理者として申請）
                    </p>
                    <CandidateRadios
                      name="rq05-place"
                      labelledBy="rq05-place-label"
                      items={data.managed.map(placeCandidate(onPreset))}
                      value={place?.placeId ?? null}
                      disabled={sending}
                      invalid={errors.place !== undefined}
                      onChange={(id) => {
                        const next = data.managed.find(
                          (item) => item.placeId === id,
                        );
                        if (next !== undefined) choosePlace(next);
                      }}
                    />
                  </>
                )}
                <p className="rq05-caption">
                  管理者のいない店舗（個人として申請）
                </p>
                <KeywordSearch<PlaceOption>
                  key={restored.count}
                  initial={restored.place}
                  keep={keepPlaceSearch}
                  label="管理者のいない店舗をキーワードで探す"
                  placeholder="店舗名・住所で探す"
                  disabled={sending}
                  search={async (keyword) =>
                    preset === null
                      ? []
                      : (
                          await findMembershipPlacesFn({
                            data: { regionId: preset.regionId, keyword },
                          })
                        ).items
                  }
                >
                  {(items) => (
                    <CandidateRadios
                      name="rq05-place"
                      labelledBy="rq05-place-label"
                      items={items.map(placeCandidate(onPreset))}
                      value={place?.placeId ?? null}
                      disabled={sending}
                      invalid={errors.place !== undefined}
                      onChange={(id) => {
                        const next = items.find((item) => item.placeId === id);
                        if (next !== undefined) choosePlace(next);
                      }}
                    />
                  )}
                </KeywordSearch>
                {errors.place === undefined ? null : (
                  <p className="m-field__error">{errors.place}</p>
                )}
                <p className="m-field__help">
                  選んだ店舗は、ほかの候補を選んで選び直せます。
                </p>
              </div>
            ) : place === null ? null : (
              <TargetRow
                name={place.name}
                meta={place.meta}
                sub={place.sub}
                photoUrl={place.photoUrl}
                href={placeHref(place)}
              />
            )}
          </div>

          {mineShown.length === 0 ? null : (
            <MyActiveApplications placeName={placeName} items={mineShown} />
          )}

          {data.kindFixed ? (
            <div className="m-field">
              <p className="m-field__label">申請の種類</p>
              <p className="rq05-fixed">{MEMBERSHIP_KIND_LABEL[data.kind]}</p>
            </div>
          ) : (
            <ChoiceGroup<MembershipKind>
              legend="申請の種類"
              name="rq05-kind"
              requirement="required"
              value={kind}
              onChange={chooseKind}
              choices={[
                { value: "affiliation", label: "所属" },
                { value: "leave", label: "離脱", disabled: !canLeave },
              ]}
              {...(canLeave
                ? {}
                : {
                    help: `${placeName}は、${steward ? "" : "閲覧者に表示されている"}どの地域にも所属していません。離脱は選べません。`,
                  })}
            />
          )}

          {resubmit !== null ? (
            <div className="m-field">
              <p className="m-field__label">{regionLabel}</p>
              {region === null ? null : (
                <TargetRow
                  name={region.name}
                  meta={region.meta}
                  photoUrl={region.photoUrl}
                  href={regionHref(region)}
                />
              )}
            </div>
          ) : kind === "leave" ? (
            <fieldset className="m-field" id="rq05-region">
              <legend className="m-field__label">
                {regionLabel}
                <span className="m-field__req">必須</span>
              </legend>
              <CandidateRadios
                name="rq05-region-leave"
                items={leaveChoices.map(regionCandidate)}
                value={region?.regionId ?? null}
                disabled={sending}
                invalid={errors.region !== undefined}
                onChange={(id) => {
                  const next = leaveChoices.find(
                    (item) => item.regionId === id,
                  );
                  if (next === undefined) return;
                  setRegion(next);
                  setErrors((current) => ({ ...current, region: undefined }));
                }}
              />
              {errors.region === undefined ? null : (
                <p className="m-field__error">{errors.region}</p>
              )}
              <p className="m-field__help">
                {steward
                  ? `${placeName}が所属している地域です。閲覧者に表示されていない地域との所属も、状態とともに示します。`
                  : `${placeName}が所属している地域のうち、閲覧者に表示されている地域です。`}
              </p>
            </fieldset>
          ) : (
            <fieldset className="m-field" id="rq05-region">
              <legend className="m-field__label">
                {region !== null && regionRefusal !== null
                  ? "所属する地域"
                  : regionLabel}
                <span className="m-field__req">必須</span>
              </legend>
              {region === null ? null : (
                <div className="rq05-picked">
                  <TargetRow
                    name={region.name}
                    meta={region.meta}
                    {...(region.regionId === preset?.regionId && fromRegion
                      ? { sub: "地域の詳細から選んだ地域" }
                      : {})}
                    photoUrl={region.photoUrl}
                    href={regionHref(region)}
                  />
                  {regionRefusal === null ? null : (
                    <>
                      <p className="m-field__error">
                        {`${regionRefusal.reason}下の候補から別の地域を選ぶか、店舗を選び直してください。`}
                      </p>
                      {regionRefusal.go?.kind === "affiliationStatus" ? (
                        <TextLink
                          to={affiliationStatusPath(place?.placeId ?? "")}
                        >
                          {`${placeName}の所属地域の状況を見る`}
                        </TextLink>
                      ) : regionRefusal.go?.kind === "application" ? (
                        <TextLink
                          to={applicationPath(regionRefusal.go.applicationId)}
                        >
                          申請の詳細を見る
                        </TextLink>
                      ) : null}
                    </>
                  )}
                  {regionRefusal === null && !picking && place !== null ? (
                    <div>
                      <Button
                        variant="secondary"
                        fit
                        disabled={sending}
                        onClick={() => setPicking(true)}
                      >
                        地域を選び直す
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
              {place === null ? (
                <p className="m-field__help">
                  店舗を選ぶと、地域を選び直せます。
                </p>
              ) : region === null || regionRefusal !== null || picking ? (
                <>
                  {region !== null ? (
                    <p className="m-field__label">別の地域を選ぶ</p>
                  ) : null}
                  {joinSearch}
                  {picking && region !== null ? (
                    <TextButton onClick={() => setPicking(false)}>
                      選び直さずに戻る
                    </TextButton>
                  ) : null}
                </>
              ) : null}
              {errors.region === undefined || region !== null ? null : (
                <p className="m-field__error">{errors.region}</p>
              )}
              <p className="m-field__help">
                公開中の地域から選びます。地域の詳細で、まちの様子を確かめられます。
              </p>
            </fieldset>
          )}

          {kind === "leave" ? (
            <Notice
              variant="manage"
              tone="paper"
              title="承認されるまで、所属は続きます"
            >
              {`離脱の申請は、地域の運営者が確かめます。承認されるまで、${placeName}は${region?.name ?? "選んだ地域"}に所属したままです。`}
            </Notice>
          ) : null}

          {resubmit === null ? null : (
            <ReplyField
              value={reply}
              onChange={setReply}
              disabled={sending}
              help="再提出では、店舗・地域・申請の種類は変えられません。回答を添えて、追加の確認に答えます。"
              {...(errors.reply === undefined ? {} : { error: errors.reply })}
            />
          )}
        </HydrationGate>
      </form>
    </ManagePage>
  );
}
