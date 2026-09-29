"use client";

import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { EventPage } from "@/components/event/EventShell";
import { ProxyUnavailablePanel } from "@/components/event/EventShell/EventProblem";
import { useOccasionFrame } from "@/components/event/EventShell/useOccasionFrame";
import { ManageBody, ManageStatus } from "@/components/layout/ManageShell";
import { listingPagePath, placePagePath } from "@/components/manage/ShopShell";
import { ListFooter } from "@/components/region/ListFooter";
import { usePagedList } from "@/components/region/usePagedList";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChipButton, ChipLink } from "@/components/ui/ChipButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink, RowLink } from "@/components/ui/Rows";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TextLink } from "@/components/ui/TextButton";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { jpDateWithWeekday } from "@/presentation/listingView";
import {
  excludeParticipantFn,
  listOccasionApplicationsFn,
  listParticipantsFn,
} from "@/presentation/occasion";
import {
  APPLICATION_PAGE_SIZE,
  attachedListingState,
  occasionName,
  PARTICIPANT_PAGE_SIZE,
  type ParticipantBoardData,
  type ParticipantItem,
  periodText,
  type SubjectApplicationItem,
} from "@/presentation/occasionView";
import { OPERATING_STATUS_LABEL } from "@/presentation/placeView";
import { useReconcile } from "@/presentation/reconcile";
import { reviewFrom } from "@/presentation/reviewOrigin";

type Outcome =
  | Readonly<{ kind: "excluded"; name: string }>
  | Readonly<{ kind: "gone"; name: string }>
  | Readonly<{ kind: "failed"; name: string; error: ErrorState }>
  | Readonly<{ kind: "proxyLost" }>
  | Readonly<{ kind: "lostAccess" }>;

/** The attached listings and dates of one participation (EM-01's rows). */
export function ParticipationSummary({ item }: { item: ParticipantItem }) {
  const { listings, dates, outOfPeriodDates } = item.participation;
  const outside = new Set(outOfPeriodDates);
  const inside = dates.filter((date) => !outside.has(date));
  return (
    <div className="em-sub">
      <p className="em-label">添えた掲載</p>
      {listings.length === 0 ? (
        <p className="p-item__text">添えた掲載はありません</p>
      ) : (
        listings.map((listing) => {
          const state = attachedListingState(listing);
          if (listing.deleted) {
            return (
              <p key={listing.id} className="p-item__text">
                削除された掲載
              </p>
            );
          }
          const name = listing.name ?? "名称未設定";
          return state.hidden ? (
            <p key={listing.id} className="p-item__text">
              {`${name} · ${state.label}（閲覧者に表示されていません）`}
            </p>
          ) : (
            <p key={listing.id} className="em-listing">
              <TextLink to={listingPagePath(listing.id)}>{name}</TextLink>
              {state.label === "提供中" ? null : (
                <span className="p-item__text">{` · ${state.label}`}</span>
              )}
            </p>
          );
        })
      )}
      <p className="em-label">参加日</p>
      <p className="p-item__text">
        {inside.length === 0
          ? "参加日はありません"
          : inside.map(jpDateWithWeekday).join("・")}
      </p>
      {outOfPeriodDates.map((date) => (
        <p key={date} className="p-item__text" data-tone="alert">
          {`${jpDateWithWeekday(date)} · 開催期間の外（閲覧者に表示されていません）`}
        </p>
      ))}
    </div>
  );
}

const applicationKey = (item: SubjectApplicationItem) => item.applicationId;

/** 参加の申請: every application with its state, a page at a time (CF-05). */
function ApplicationsSection({
  data,
  occasionId,
}: {
  data: ParticipantBoardData;
  occasionId: string;
}) {
  const fetchPage = useCallback(
    (page: number) =>
      listOccasionApplicationsFn({ data: { occasionId, page } }),
    [occasionId],
  );
  const list = usePagedList(
    { items: data.applications, count: data.applicationCount },
    APPLICATION_PAGE_SIZE,
    applicationKey,
    fetchPage,
  );
  return (
    <section className="m-section" aria-labelledby="em01-apply">
      <div className="em-head">
        <SectionTitle variant="manage" id="em01-apply">
          参加の申請
        </SectionTitle>
        {data.underReviewCount > 0 ? (
          <Badge tone="accent">{`確認中 ${data.underReviewCount}件`}</Badge>
        ) : null}
      </div>
      {list.items.length === 0 ? (
        <p className="m-field__help">
          申請はありません。店舗から参加の申請が届くと、ここに並びます。
        </p>
      ) : (
        <>
          <LinkList>
            {list.items.map((application) => (
              <li key={application.applicationId}>
                <ListRowLink
                  to="/manage/applications/$applicationId"
                  params={{ applicationId: application.applicationId }}
                  search={{
                    from: reviewFrom({ kind: "occasion", id: occasionId }),
                  }}
                  title={application.title}
                  meta={
                    application.detail === null ? (
                      application.meta
                    ) : (
                      <>
                        {application.meta}
                        <span className="em-apply__detail">
                          {application.detail}
                        </span>
                      </>
                    )
                  }
                  end={
                    <Badge tone={application.tone}>{application.status}</Badge>
                  }
                />
              </li>
            ))}
          </LinkList>
          <p className="m-field__help">
            確認中の申請を選ぶと、申請の判断へ進みます。
          </p>
          <ListFooter {...list} endText="すべての申請を表示しました" />
        </>
      )}
    </section>
  );
}

function appendNew(
  current: readonly ParticipantItem[],
  more: readonly ParticipantItem[],
): readonly ParticipantItem[] {
  const seen = new Set(current.map((item) => item.placeId));
  return [...current, ...more.filter((item) => !seen.has(item.placeId))];
}

/**
 * EM-01 参加店舗と申請 (EVT-07, EVT-09, EVT-10): the participation
 * applications (they arrive with stage 3b), the participants with their
 * listings and dates, the exclusion of a participant (CS-12, whatever its
 * steward or the holding status) and the entries to CM-04. The board owns
 * the list, so an exclusion removes its row optimistically and keeps its
 * outcome after the row is gone.
 */
export function ParticipantBoard({ data }: { data: ParticipantBoardData }) {
  const frame = useOccasionFrame();
  const router = useRouter();
  const reconcile = useReconcile();
  const navigate = useNavigate();
  const here = useLocation({ select: (location) => location.href });
  const params = { occasionId: frame.occasionId };
  const proxy = frame.basis === "proxy";

  const [more, setMore] = useState<readonly ParticipantItem[]>([]);
  const [loadedPages, setLoadedPages] = useState(1);
  const [count, setCount] = useState(data.count);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [loadFailure, setLoadFailure] = useState<ErrorState | null>(null);
  const [loading, startLoading] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCount(data.count);
  }, [data.count]);

  const listed = appendNew(data.participants, more).filter(
    (item) => !gone.has(item.placeId),
  );
  const [shown, removeOptimistic] = useOptimistic(
    listed,
    (current: readonly ParticipantItem[], placeId: string) =>
      current.filter((item) => item.placeId !== placeId),
  );
  const [confirming, setConfirming] = useState<ParticipantItem | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [excluding, startExclude] = useTransition();
  const listRef = useRef<HTMLElement>(null);

  const hasMore = loadedPages * PARTICIPANT_PAGE_SIZE < count;
  const failed = loadFailure !== null;
  const loadMore = useCallback(() => {
    startLoading(async () => {
      try {
        const page = await listParticipantsFn({
          data: { occasionId: frame.occasionId, page: loadedPages + 1 },
        });
        setMore((current) => appendNew(current, page.items));
        setCount(page.count);
        setLoadedPages((pages) => pages + 1);
        setLoadFailure(null);
      } catch (error) {
        const state = classifyError(error);
        if (state.kind === "loginRequired") {
          await navigate({ to: "/login", search: { next: here } });
          return;
        }
        setLoadFailure(state);
      }
    });
  }, [frame.occasionId, loadedPages, navigate, here]);

  useEffect(() => {
    const target = sentinel.current;
    if (target === null || !hasMore || failed || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, failed, loading, loadMore]);

  const exclude = (item: ParticipantItem) =>
    startExclude(async () => {
      setConfirming(null);
      setOutcome(null);
      removeOptimistic(item.placeId);
      listRef.current?.focus();
      try {
        await excludeParticipantFn({
          data: { occasionId: frame.occasionId, placeId: item.placeId },
        });
        setGone((current) => new Set([...current, item.placeId]));
        setOutcome({ kind: "excluded", name: item.name });
        await reconcile();
      } catch (error) {
        const state = classifyError(error);
        if (state.kind === "notFound") {
          setGone((current) => new Set([...current, item.placeId]));
          setOutcome({ kind: "gone", name: item.name });
          await reconcile();
          return;
        }
        if (state.kind === "forbidden") {
          setOutcome({ kind: proxy ? "proxyLost" : "lostAccess" });
          router.clearCache();
          return;
        }
        setOutcome({ kind: "failed", name: item.name, error: state });
      }
    });

  const eventName = occasionName(frame.name);

  if (outcome?.kind === "lostAccess" || outcome?.kind === "proxyLost") {
    return (
      <EventPage frame={frame} heading="参加店舗と申請">
        <ManageBody>
          <FocusOnMount role="alert">
            {outcome.kind === "proxyLost" ? (
              <ProxyUnavailablePanel occasionId={frame.occasionId}>
                このイベントにはイベント運営者が就きました。除外は反映していません。イベントの運営の画面で、運営者がいることを確かめてください。
              </ProxyUnavailablePanel>
            ) : (
              <EmptyPanel
                title="このイベントを運営する権限がありません"
                actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
              >
                イベントの管理権限がなくなったため、除外は反映していません。
              </EmptyPanel>
            )}
          </FocusOnMount>
        </ManageBody>
      </EventPage>
    );
  }

  if (outcome?.kind === "excluded") {
    return (
      <EventPage frame={frame} heading="参加店舗と申請">
        <FocusOnMount>
          <DonePanel
            title={`${outcome.name}を除外しました`}
            actions={
              <Button onClick={() => setOutcome(null)}>
                参加店舗と申請に戻る
              </Button>
            }
          >
            {`${outcome.name}は、${eventName}の参加店舗から外れました。店舗と掲載の公開状態・提供状態と、他のイベントへの参加は変わっていません。`}
          </DonePanel>
        </FocusOnMount>
      </EventPage>
    );
  }

  const empty =
    data.participants.length === 0 &&
    shown.length === 0 &&
    data.applications.length === 0;
  const addLink = (
    <ButtonLink
      to="/manage/events/$occasionId/participants/new"
      params={params}
    >
      管理者のいない店舗を追加
    </ButtonLink>
  );
  const focus = data.focus;

  return (
    <EventPage
      frame={frame}
      heading="参加店舗と申請"
      {...(empty ? {} : { actions: addLink })}
    >
      <ManageBody>
        {frame.period === null ? null : (
          <ManageStatus tone="neutral">
            {`開催期間 ${periodText(frame.period)}`}
          </ManageStatus>
        )}
        {focus === null ? null : focus.participating ? (
          <div role="status">
            <Notice
              variant="manage"
              title={`${focus.name ?? "通知の店舗"}の参加内容が変わりました`}
              actions={
                <a className="text-button" href={`#p-${focus.placeId}`}>
                  {`${focus.name ?? "この店舗"}の参加を見る`}
                </a>
              }
            >
              現在の参加内容を、参加店舗の一覧に示しています。
            </Notice>
          </div>
        ) : (
          <Alert title={`${focus.name ?? "通知の店舗"}は参加していません`}>
            {`${focus.name ?? "この店舗"}の参加は、参加の取りやめか除外で、すでに解除されていました。最新の参加店舗を示しています。`}
          </Alert>
        )}
        {outcome?.kind === "gone" ? (
          <Alert title={`${outcome.name}は除外できませんでした`}>
            {`${outcome.name}の参加は、参加の取りやめか別の運営者の除外で、すでに解除されていました。最新の参加店舗を示しています。`}
          </Alert>
        ) : outcome?.kind === "failed" ? (
          <Alert
            title={`${outcome.name}を除外できませんでした`}
            actions={
              <Button
                variant="secondary"
                disabled={excluding}
                onClick={() => setOutcome(null)}
              >
                閉じる
              </Button>
            }
          >
            {outcome.error.kind === "failed"
              ? "通信を確かめて、もう一度除外してください。"
              : outcome.error.message}
          </Alert>
        ) : null}

        <ApplicationsSection data={data} occasionId={frame.occasionId} />

        <section
          className="m-section"
          aria-labelledby="em01-shops"
          ref={listRef}
          tabIndex={-1}
        >
          <div className="em-head">
            <SectionTitle variant="manage" id="em01-shops">
              参加店舗
            </SectionTitle>
            {shown.length === 0 ? null : (
              <Badge>{`${hasMore ? count : shown.length}店舗`}</Badge>
            )}
          </div>
          {shown.length === 0 ? (
            <EmptyPanel
              title="参加店舗はありません"
              actions={
                <ButtonLink
                  variant="secondary"
                  to="/manage/events/$occasionId/participants/new"
                  params={params}
                >
                  管理者のいない店舗を追加
                </ButtonLink>
              }
            >
              店舗からの参加の申請を承認すると、ここに並びます。店舗管理者のいない店舗は、参加内容を登録して追加できます。
            </EmptyPanel>
          ) : (
            <>
              <ul className="p-items" aria-busy={loading}>
                {shown.map((item) => (
                  <li
                    key={item.placeId}
                    id={`p-${item.placeId}`}
                    className="p-item"
                  >
                    <RowLink
                      to={placePagePath(item.placeId)}
                      photo={
                        item.photoUrl === null
                          ? null
                          : { src: item.photoUrl, alt: "" }
                      }
                      name={item.name}
                      meta={
                        item.hasSteward
                          ? "店舗管理者がいます"
                          : "店舗管理者がいません"
                      }
                      sub={
                        <span className="p-badges">
                          <Badge
                            tone={
                              item.operatingStatus === "open"
                                ? "accent"
                                : "muted"
                            }
                          >
                            {OPERATING_STATUS_LABEL[item.operatingStatus]}
                          </Badge>
                          {item.suspended ? (
                            <Badge tone="alert">店舗は非公開</Badge>
                          ) : null}
                        </span>
                      }
                    />
                    <ParticipationSummary item={item} />
                    <div className="p-item__ops">
                      {item.hasSteward ? null : (
                        <ChipLink
                          to="/manage/events/$occasionId/participants/$placeId"
                          params={{ ...params, placeId: item.placeId }}
                        >
                          参加内容を変更
                        </ChipLink>
                      )}
                      <ChipButton
                        disabled={excluding}
                        aria-label={`${item.name}を除外する`}
                        onClick={() => {
                          setOutcome(null);
                          setConfirming(item);
                        }}
                      >
                        除外する
                      </ChipButton>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="m-field__help">
                除外は、理由を求めずに、店舗管理者の有無と開催の状態にかかわらず行えます。参加内容を変更できるのは、店舗管理者のいない店舗だけです。
              </p>
              {loadFailure !== null ? (
                <div role="alert">
                  <Notice
                    variant="manage"
                    title="続きの参加店舗を読み込めませんでした"
                    actions={
                      <Button
                        variant="secondary"
                        onClick={loadMore}
                        disabled={loading}
                      >
                        もう一度読み込む
                      </Button>
                    }
                  >
                    {loadFailure.kind === "failed"
                      ? "通信を確かめて、もう一度読み込んでください。"
                      : loadFailure.message}
                  </Notice>
                </div>
              ) : hasMore ? (
                <div ref={sentinel}>
                  <p className="p-end" role="status">
                    {loading ? "続きを読み込んでいます" : ""}
                  </p>
                </div>
              ) : (
                <p className="p-end">すべての参加店舗を表示しました</p>
              )}
            </>
          )}
        </section>
      </ManageBody>

      <ConfirmDialog
        open={confirming !== null}
        title={`${confirming?.name ?? ""}を除外しますか`}
        confirmLabel="除外する"
        pending={excluding}
        onConfirm={() => {
          if (confirming !== null) exclude(confirming);
        }}
        onCancel={() => setConfirming(null)}
      >
        <p>確定すると、次のようになります。</p>
        <ul>
          <li>{`${confirming?.name ?? ""}の参加が解除され、${eventName}の参加店舗から外れます`}</li>
          <li>店舗と掲載の公開状態・提供状態は変わりません</li>
          <li>他のイベントへの参加は変わりません</li>
          <li>
            {confirming?.hasSteward === false
              ? "除外は取り消せません。店舗管理者のいない店舗は、運営者が参加店舗に直接加え直せます"
              : "除外は取り消せません。再び参加するには、店舗からの参加の申請が必要です"}
          </li>
        </ul>
      </ConfirmDialog>
    </EventPage>
  );
}
