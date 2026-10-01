"use client";

import { useRouter } from "@tanstack/react-router";
import { useOptimistic, useRef, useState, useTransition } from "react";
import {
  CandidateDialog,
  CandidateSearch,
} from "@/components/event/CandidatePicker";
import { EventPage, regionPagePath } from "@/components/event/EventShell";
import { ProxyUnavailablePanel } from "@/components/event/EventShell/EventProblem";
import { useOccasionFrame } from "@/components/event/EventShell/useOccasionFrame";
import { ManageBody } from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/ChipButton";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Row, RowLink } from "@/components/ui/Rows";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { jpDate } from "@/presentation/listingView";
import {
  findRegionCandidatesFn,
  linkRegionFn,
  unlinkRegionFn,
} from "@/presentation/occasion";
import {
  occasionPublicationLabel,
  type RegionLinkItem,
  type RegionLinksData,
} from "@/presentation/occasionView";
import { useReconcile } from "@/presentation/reconcile";

type Optimistic =
  | Readonly<{ type: "link"; item: RegionLinkItem }>
  | Readonly<{ type: "unlink"; regionId: string }>;

type Outcome =
  | Readonly<{ kind: "linked"; regionId: string; name: string }>
  | Readonly<{ kind: "unlinked"; name: string }>
  | Readonly<{ kind: "unviewable" }>
  | Readonly<{ kind: "changed"; title: string; message: string }>
  | Readonly<{ kind: "failed"; title: string; error: ErrorState }>
  | Readonly<{ kind: "proxyLost" }>
  | Readonly<{ kind: "lostAccess" }>;

const regionName = (name: string | null): string => name ?? "名称未設定の地域";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const dayOf = (iso: string): string =>
  new Date(new Date(iso).getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);

function apply(
  current: readonly RegionLinkItem[],
  action: Optimistic,
): readonly RegionLinkItem[] {
  switch (action.type) {
    case "link":
      return current.some((item) => item.regionId === action.item.regionId)
        ? current
        : [...current, action.item];
    case "unlink":
      return current.filter((item) => item.regionId !== action.regionId);
  }
}

function RegionRow({
  item,
  onUnlink,
  busy,
}: {
  item: RegionLinkItem;
  onUnlink: (item: RegionLinkItem) => void;
  busy: boolean;
}) {
  const viewable = item.publication.status === "published" && !item.suspended;
  const name = regionName(item.name);
  const badges = (
    <span className="p-badges">
      {item.suspended ? <Badge tone="alert">運営による非公開</Badge> : null}
      <Badge tone={viewable ? "accent" : "neutral"}>
        {item.suspended && item.publication.status === "published"
          ? "公開"
          : occasionPublicationLabel(item.publication)}
      </Badge>
      {item.status === "detached" ? <Badge tone="muted">解除済み</Badge> : null}
    </span>
  );
  const photo = item.photoUrl === null ? null : { src: item.photoUrl, alt: "" };
  const meta =
    item.status === "detached"
      ? "地域の運営者が関連づけを解除しました"
      : `${jpDate(dayOf(item.linkedAt))}に関連づけ`;
  return (
    <li className="p-item">
      {viewable ? (
        <RowLink
          to={regionPagePath(item.regionId)}
          photo={photo}
          name={name}
          meta={meta}
          sub={badges}
        />
      ) : (
        <Row photo={photo} name={name} meta={meta} sub={badges} />
      )}
      {item.status === "detached" ? (
        <p className="p-item__text">
          この地域には、再び関連づけられません。地域の運営者が解除を取り消すと、関連づけが回復します。
        </p>
      ) : viewable ? null : (
        <p className="p-item__text">
          {item.suspended
            ? "運営による非公開のため、閲覧者には表示されていません。"
            : "地域が公開されていないため、閲覧者には表示されていません。"}
        </p>
      )}
      {item.status === "linked" ? (
        <div className="p-item__ops">
          <ChipButton
            disabled={busy}
            aria-label={`${name}を外す`}
            onClick={() => onUnlink(item)}
          >
            外す
          </ChipButton>
        </div>
      ) : null}
    </li>
  );
}

/**
 * EM-03 開催地域の関連づけ (EVT-05): the linked regions and those their
 * operators detached, told apart; a published region chosen through CF-02
 * is linked at once, without the region's approval, and a linked one is
 * removed without a confirmation (it can be linked again). The board owns
 * the list, so both changes show optimistically.
 */
export function RegionLinkBoard({ data }: { data: RegionLinksData }) {
  const frame = useOccasionFrame();
  const router = useRouter();
  const reconcile = useReconcile();
  const proxy = frame.basis === "proxy";
  const [items, applyOptimistic] = useOptimistic(data.items, apply);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, startBusy] = useTransition();
  const listRef = useRef<HTMLElement>(null);

  const refused = async (
    error: unknown,
    attempt: "link" | "unlink",
    title: string,
  ) => {
    const state = classifyError(error);
    if (state.kind === "forbidden") {
      setOutcome({ kind: proxy ? "proxyLost" : "lostAccess" });
      router.clearCache();
      return;
    }
    if (
      state.code === "OCCASION_REGION_NOT_VIEWABLE" ||
      state.code === "REGION_NOT_FOUND"
    ) {
      setOutcome({ kind: "unviewable" });
      await reconcile();
      return;
    }
    if (state.kind === "premiseChanged" || state.kind === "notFound") {
      setOutcome({
        kind: "changed",
        title,
        message:
          state.kind === "notFound"
            ? "外そうとした関連づけは、すでにありませんでした"
            : attempt === "unlink" &&
                state.code === "OCCASION_REGION_LINK_DETACHED"
              ? "この地域の運営者が、先に関連づけを解除していました"
              : state.message,
      });
      await reconcile();
      return;
    }
    setOutcome({ kind: "failed", title, error: state });
  };

  const link = (regionId: string, name: string, photoUrl: string | null) =>
    startBusy(async () => {
      setPicking(false);
      setOutcome(null);
      applyOptimistic({
        type: "link",
        item: {
          regionId,
          name,
          photoUrl,
          status: "linked",
          publication: { status: "published", reason: null },
          suspended: false,
          linkedAt: new Date().toISOString(),
        },
      });
      try {
        await linkRegionFn({
          data: { occasionId: frame.occasionId, regionId },
        });
        setOutcome({ kind: "linked", regionId, name });
        await reconcile();
      } catch (error) {
        await refused(error, "link", `${name}を関連づけられませんでした`);
      }
    });

  const unlink = (item: RegionLinkItem) =>
    startBusy(async () => {
      const name = regionName(item.name);
      setOutcome(null);
      applyOptimistic({ type: "unlink", regionId: item.regionId });
      listRef.current?.focus();
      try {
        await unlinkRegionFn({
          data: { occasionId: frame.occasionId, regionId: item.regionId },
        });
        setOutcome({ kind: "unlinked", name });
        await reconcile();
      } catch (error) {
        await refused(error, "unlink", `${name}を外せませんでした`);
      }
    });

  if (outcome?.kind === "lostAccess" || outcome?.kind === "proxyLost") {
    return (
      <EventPage frame={frame} heading="開催地域">
        <ManageBody>
          <FocusOnMount role="alert">
            {outcome.kind === "proxyLost" ? (
              <ProxyUnavailablePanel occasionId={frame.occasionId}>
                このイベントにはイベント運営者が就きました。関連づけの変更は反映していません。イベントの運営の画面で、運営者がいることを確かめてください。
              </ProxyUnavailablePanel>
            ) : (
              <EmptyPanel
                title="このイベントを運営する権限がありません"
                actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
              >
                イベントの管理権限がなくなったため、関連づけの変更は反映していません。
              </EmptyPanel>
            )}
          </FocusOnMount>
        </ManageBody>
      </EventPage>
    );
  }

  if (outcome?.kind === "linked" || outcome?.kind === "unlinked") {
    const linked = outcome.kind === "linked" ? outcome : null;
    return (
      <EventPage frame={frame} heading="開催地域">
        <FocusOnMount>
          <DonePanel
            title={
              linked === null
                ? `${outcome.name}を外しました`
                : `${outcome.name}を関連づけました`
            }
            actions={
              <>
                <Button onClick={() => setOutcome(null)}>開催地域に戻る</Button>
                {linked === null ? null : (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      unlink({
                        regionId: linked.regionId,
                        name: linked.name,
                        photoUrl: null,
                        status: "linked",
                        publication: { status: "published", reason: null },
                        suspended: false,
                        linkedAt: new Date().toISOString(),
                      })
                    }
                  >
                    {`${linked.name}を外す`}
                  </Button>
                )}
              </>
            }
          >
            {linked === null
              ? `${outcome.name}は、開催地域の一覧から外れました。あらためて関連づけられます。`
              : `${outcome.name}が、関連づけ中の地域に加わりました。地域ページとイベントページの両方に、関連が示されます。`}
          </DonePanel>
        </FocusOnMount>
      </EventPage>
    );
  }

  const linkedItems = items.filter((item) => item.status === "linked");
  const detached = items.filter((item) => item.status === "detached");
  const empty = items.length === 0;
  const openPicker = () => {
    setOutcome(null);
    setPicking(true);
  };

  return (
    <EventPage
      frame={frame}
      heading="開催地域"
      {...(empty
        ? {}
        : {
            actions: (
              <Button disabled={busy} onClick={openPicker}>
                地域を選んで関連づける
              </Button>
            ),
          })}
    >
      <ManageBody>
        {outcome?.kind === "unviewable" ? (
          <Alert title="選んだ地域は関連づけられませんでした">
            選んだ地域は、閲覧できない地域になっていました。関連づけは反映していません。別の地域を選べます。
          </Alert>
        ) : outcome?.kind === "changed" ? (
          <Alert title={outcome.title}>
            {`${outcome.message}。何も変えていません。最新の一覧を示しています。`}
          </Alert>
        ) : outcome?.kind === "failed" ? (
          <Alert title={outcome.title}>
            {outcome.error.kind === "failed"
              ? "通信を確かめて、もう一度お試しください。関連づけは変わっていません。"
              : outcome.error.message}
          </Alert>
        ) : null}

        {empty ? (
          <EmptyPanel
            title="関連づけている地域はありません"
            actions={
              <Button variant="secondary" disabled={busy} onClick={openPicker}>
                地域を選んで関連づける
              </Button>
            }
          >
            開催地域を関連づけると、地域ページとイベントページの両方に関連が示されます。公開中の地域から選べて、地域の運営者の承認は要りません。
          </EmptyPanel>
        ) : (
          <>
            <section
              className="m-section"
              aria-labelledby="em03-linked"
              ref={listRef}
              tabIndex={-1}
            >
              <div className="em-head">
                <SectionTitle variant="manage" id="em03-linked">
                  関連づけ中の地域
                </SectionTitle>
                <Badge>{`${linkedItems.length}件`}</Badge>
              </div>
              {linkedItems.length === 0 ? (
                <p className="m-field__help">
                  関連づけ中の地域はありません。地域を選んで関連づけられます。
                </p>
              ) : (
                <ul className="p-items">
                  {linkedItems.map((item) => (
                    <RegionRow
                      key={item.regionId}
                      item={item}
                      onUnlink={unlink}
                      busy={busy}
                    />
                  ))}
                </ul>
              )}
              <p className="m-field__help">
                外した地域は、あらためて関連づけられます。
              </p>
            </section>
            {detached.length === 0 ? null : (
              <section className="m-section" aria-labelledby="em03-detached">
                <div className="em-head">
                  <SectionTitle variant="manage" id="em03-detached">
                    地域の運営者が解除した地域
                  </SectionTitle>
                  <Badge tone="muted">{`${detached.length}件`}</Badge>
                </div>
                <ul className="p-items">
                  {detached.map((item) => (
                    <RegionRow
                      key={item.regionId}
                      item={item}
                      onUnlink={unlink}
                      busy={busy}
                    />
                  ))}
                </ul>
              </section>
            )}
            <p className="p-end">すべての地域を表示しました</p>
          </>
        )}
      </ManageBody>

      <CandidateDialog
        open={picking}
        title="開催地域を選ぶ"
        onClose={() => setPicking(false)}
      >
        <CandidateSearch
          id="em03-keyword"
          label="キーワード"
          placeholder="地域の名称・エリアで探す"
          help="候補は公開中の地域です。選んだ時点で関連づけます。地域の運営者の承認は要りません。"
          search={(keyword) =>
            findRegionCandidatesFn({
              data: { occasionId: frame.occasionId, keyword },
            })
          }
          detailPath={regionPagePath}
          detailLabel="地域ページ"
          onPick={(item) => link(item.id, item.name, item.photoUrl)}
          disabled={busy}
          autoFocus
        />
      </CandidateDialog>
    </EventPage>
  );
}
