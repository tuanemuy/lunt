"use client";

import { useRouter } from "@tanstack/react-router";
import { useCallback, useOptimistic, useState, useTransition } from "react";
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
import { useReconcile } from "@/presentation/reconcile";
import {
  changeRegionLinkFn,
  listRegionLinksFn,
  type RegionLinkChange,
} from "@/presentation/region";
import {
  HOLDING_STATUS_LABEL,
  type ListPage,
  occasionPagePath,
  periodText,
  REGION_LIST_PAGE_SIZE,
  type RegionLinkItem,
  regionNameText,
  regionPagePath,
  regionPublicationLabel,
} from "@/presentation/regionView";
import { ListFooter } from "../ListFooter";
import { RegionPage } from "../RegionShell";
import { useRegionFrame } from "../RegionShell/useRegionFrame";
import { usePagedList } from "../usePagedList";

const HEADING = "関連づけられたイベント";

/** `detachRegionLink` / `restoreRegionLink` when the link is gone (the event side unlinked it). */
const REGION_LINK_NOT_FOUND = "REGION_LINK_NOT_FOUND";

type Outcome =
  | Readonly<{ kind: "done"; change: RegionLinkChange; item: RegionLinkItem }>
  | Readonly<{
      kind: "changed";
      change: RegionLinkChange;
      item: RegionLinkItem;
      code: string | null;
    }>
  | Readonly<{
      kind: "failed";
      change: RegionLinkChange;
      item: RegionLinkItem;
      error: ErrorState;
    }>
  | Readonly<{ kind: "lostProxy" }>
  | Readonly<{ kind: "lostAccess" }>
  | Readonly<{ kind: "missing" }>;

const linkKey = (item: RegionLinkItem) => item.occasionId;
const occasionName = (item: RegionLinkItem) =>
  item.name ?? "名称未設定のイベント";

function LinkBadges({ item }: { item: RegionLinkItem }) {
  const { holdingStatus } = item;
  return (
    <span className="p-badges">
      {holdingStatus === null ? null : (
        <Badge
          tone={
            holdingStatus === "upcoming" || holdingStatus === "ongoing"
              ? "accent"
              : "muted"
          }
        >
          {HOLDING_STATUS_LABEL[holdingStatus]}
        </Badge>
      )}
      {item.suspended ? (
        <Badge tone="alert">運営による非公開</Badge>
      ) : (
        <Badge>{regionPublicationLabel(item.publication)}</Badge>
      )}
      {item.status === "detached" ? <Badge tone="muted">解除済み</Badge> : null}
    </span>
  );
}

function LinkRow({ item }: { item: RegionLinkItem }) {
  const content = {
    photo: null,
    name: occasionName(item),
    ...(item.period === null ? {} : { meta: periodText(item.period) }),
    sub: <LinkBadges item={item} />,
  };
  return item.viewable ? (
    <RowLink to={occasionPagePath(item.occasionId)} {...content} />
  ) : (
    <Row {...content} />
  );
}

function hiddenText(item: RegionLinkItem): string | null {
  if (item.suspended) {
    return "運営による非公開のため、閲覧者には表示されていません。";
  }
  if (item.publication.status !== "published") {
    return "イベントは未公開のため、閲覧者には表示されていません。";
  }
  return null;
}

function changedText(change: RegionLinkChange, code: string | null): string {
  if (change === "restore") {
    return "別の運営者が、すでに解除を取り消していました。最新の一覧を示しています。";
  }
  return code === REGION_LINK_NOT_FOUND
    ? "イベントの運営者が、すでに開催地域の関連づけを外していました。最新の一覧を示しています。"
    : "別の運営者が、すでに関連づけを解除していました。最新の一覧を示しています。";
}

/**
 * RM-03 関連づけられたイベント (REG-11): the occasions linked to the region
 * and those it detached, in two sections; a detach (no CS-12 — it can be
 * revoked) and its revocation move an occasion between them at once, and
 * the reconcile brings the stored links. Occasions viewers cannot see are
 * shown with their state and handled the same.
 */
export function RegionLinkBoard({
  regionId,
  first,
}: {
  regionId: string;
  first: ListPage<RegionLinkItem>;
}) {
  const frame = useRegionFrame();
  const router = useRouter();
  const reconcile = useReconcile();
  const proxy = frame.basis === "proxy";
  const fetchPage = useCallback(
    (page: number) =>
      listRegionLinksFn({
        data: { regionId, page, limit: REGION_LIST_PAGE_SIZE },
      }),
    [regionId],
  );
  const list = usePagedList(first, REGION_LIST_PAGE_SIZE, linkKey, fetchPage);
  // A later page loaded before a change may still hold the old status.
  const [settled, setSettled] = useState<
    ReadonlyMap<string, RegionLinkItem["status"]>
  >(new Map());
  const fresh = new Set(first.items.map(linkKey));
  const stored = list.items.map((item) => {
    const status = fresh.has(item.occasionId)
      ? undefined
      : settled.get(item.occasionId);
    return status === undefined ? item : { ...item, status };
  });
  const [items, flip] = useOptimistic(
    stored,
    (
      current,
      move: Readonly<{ occasionId: string; status: RegionLinkItem["status"] }>,
    ) =>
      current.map((item) =>
        item.occasionId === move.occasionId
          ? { ...item, status: move.status }
          : item,
      ),
  );
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [changing, startChange] = useTransition();

  const change = (item: RegionLinkItem, kind: RegionLinkChange) => {
    setOutcome(null);
    const status = kind === "detach" ? "detached" : "linked";
    const settle = () =>
      setSettled((current) => new Map([...current, [item.occasionId, status]]));
    startChange(async () => {
      flip({ occasionId: item.occasionId, status });
      try {
        await changeRegionLinkFn({
          data: { regionId, occasionId: item.occasionId, change: kind },
        });
        settle();
        setOutcome({ kind: "done", change: kind, item: { ...item, status } });
        await reconcile();
      } catch (error) {
        const state = classifyError(error);
        if (
          state.kind === "premiseChanged" ||
          (state.kind === "notFound" && state.code === REGION_LINK_NOT_FOUND)
        ) {
          setSettled((current) => {
            const next = new Map(current);
            next.delete(item.occasionId);
            return next;
          });
          setOutcome({ kind: "changed", change: kind, item, code: state.code });
          await reconcile();
        } else if (state.kind === "notFound") {
          setOutcome({ kind: "missing" });
        } else if (state.kind === "forbidden") {
          setOutcome(proxy ? { kind: "lostProxy" } : { kind: "lostAccess" });
          if (!proxy) router.clearCache();
        } else {
          setOutcome({ kind: "failed", change: kind, item, error: state });
        }
      }
    });
  };

  if (outcome?.kind === "lostAccess" || outcome?.kind === "missing") {
    return (
      <RegionPage frame={frame} heading={HEADING}>
        <ManageBody>
          <FocusOnMount role="alert">
            {outcome.kind === "missing" ? (
              <EmptyPanel
                title="この地域は見つかりません"
                actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
              >
                地域が削除されたか、存在しない地域です。操作は反映していません。
              </EmptyPanel>
            ) : (
              <EmptyPanel
                title="この地域の地域運営者ではありません"
                actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
              >
                地域の管理権限がなくなったため、操作は反映していません。
              </EmptyPanel>
            )}
          </FocusOnMount>
        </ManageBody>
      </RegionPage>
    );
  }

  if (outcome?.kind === "done") {
    const name = occasionName(outcome.item);
    const back = (
      <Button variant="secondary" onClick={() => setOutcome(null)}>
        関連づけられたイベントに戻る
      </Button>
    );
    return (
      <RegionPage frame={frame} heading={HEADING}>
        <FocusOnMount>
          {outcome.change === "detach" ? (
            <DonePanel
              title={`${name}の関連づけを解除しました`}
              actions={
                <>
                  <Button
                    disabled={changing}
                    onClick={() => change(outcome.item, "restore")}
                  >
                    解除を取り消す
                  </Button>
                  {back}
                </>
              }
            >
              イベントは解除したイベントへ移りました。地域ページとイベントページの両方から、関連が外れています。解除は取り消せます。
            </DonePanel>
          ) : (
            <DonePanel
              title={`${name}の解除を取り消しました`}
              actions={
                <>
                  <Button onClick={() => setOutcome(null)}>
                    関連づけられたイベントに戻る
                  </Button>
                  <ButtonLink variant="secondary" to={regionPagePath(regionId)}>
                    地域ページを見る
                  </ButtonLink>
                </>
              }
            >
              イベントは関連づけ中に戻りました。地域ページとイベントページに、再び関連が示されます。
            </DonePanel>
          )}
        </FocusOnMount>
      </RegionPage>
    );
  }

  const linked = items.filter((item) => item.status === "linked");
  const detached = items.filter((item) => item.status === "detached");
  const counted = !list.hasMore;

  return (
    <RegionPage frame={frame} heading={HEADING}>
      <ManageBody>
        {outcome?.kind === "changed" ? (
          <Alert
            title={
              outcome.change === "detach"
                ? `${occasionName(outcome.item)}の関連づけを解除できませんでした`
                : `${occasionName(outcome.item)}の解除を取り消せませんでした`
            }
          >
            {changedText(outcome.change, outcome.code)}
          </Alert>
        ) : outcome?.kind === "lostProxy" ? (
          <Alert
            title="この地域は代行できません"
            actions={
              <ButtonLink
                variant="secondary"
                to="/ops/subjects/$kind/$id"
                params={{ kind: "region", id: regionId }}
              >
                地域の運営へ戻る
              </ButtonLink>
            }
          >
            この地域には地域運営者が就きました。解除と解除の取り消しは反映していません。地域の運営の画面で、運営者がいることを確かめてください。
          </Alert>
        ) : outcome?.kind === "failed" ? (
          <Alert
            title={
              outcome.change === "detach"
                ? "関連づけを解除できませんでした"
                : "解除を取り消せませんでした"
            }
            {...(outcome.error.kind === "failed"
              ? {
                  actions: (
                    <Button
                      variant="secondary"
                      disabled={changing}
                      onClick={() => change(outcome.item, outcome.change)}
                    >
                      もう一度操作する
                    </Button>
                  ),
                }
              : {})}
          >
            {outcome.error.kind === "failed"
              ? "通信を確かめて、もう一度操作してください。関連づけは変わっていません。"
              : outcome.error.message}
          </Alert>
        ) : null}

        {items.length === 0 ? (
          <EmptyPanel title="関連づけられたイベントはありません">
            {`イベントの運営者が${regionNameText(frame.name)}を開催地域に関連づけると、ここに並びます。関連づけに、地域の運営者の承認は要りません。`}
          </EmptyPanel>
        ) : (
          <>
            <section className="m-section" aria-labelledby="rm03-linked">
              <div className="om-count">
                <SectionTitle variant="manage" id="rm03-linked">
                  関連づけ中のイベント
                </SectionTitle>
                {counted ? <Badge>{`${linked.length}件`}</Badge> : null}
              </div>
              <p className="m-field__help" id="rm03-detach-help">
                関連づけを解除すると、地域ページとイベントページの両方から関連が外れます。イベントの運営者は、この地域に同じイベントを再び関連づけられません。解除は、あとから取り消せます。
              </p>
              {linked.length === 0 ? (
                <p className="m-field__help">
                  関連づけ中のイベントはありません。
                </p>
              ) : (
                <ul className="p-items" aria-busy={changing}>
                  {linked.map((item) => {
                    const hidden = hiddenText(item);
                    return (
                      <li className="p-item" key={item.occasionId}>
                        <LinkRow item={item} />
                        {hidden === null ? null : (
                          <p className="p-item__text">{hidden}</p>
                        )}
                        <div className="p-item__ops">
                          <ChipButton
                            aria-describedby="rm03-detach-help"
                            disabled={changing}
                            onClick={() => change(item, "detach")}
                          >
                            関連づけを解除
                          </ChipButton>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="m-section" aria-labelledby="rm03-detached">
              <div className="om-count">
                <SectionTitle variant="manage" id="rm03-detached">
                  解除したイベント
                </SectionTitle>
                {counted ? (
                  <Badge tone="muted">{`${detached.length}件`}</Badge>
                ) : null}
              </div>
              {detached.length === 0 ? (
                <p className="m-field__help">解除したイベントはありません。</p>
              ) : (
                <ul className="p-items" aria-busy={changing}>
                  {detached.map((item) => (
                    <li className="p-item" key={item.occasionId}>
                      <LinkRow item={item} />
                      <p className="p-item__text">
                        地域ページとイベントページのどちらにも、関連は示されていません。
                      </p>
                      <div className="p-item__ops">
                        <ChipButton
                          disabled={changing}
                          onClick={() => change(item, "restore")}
                        >
                          解除を取り消す
                        </ChipButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <ListFooter {...list} endText="すべてのイベントを表示しました" />
            </section>
          </>
        )}
      </ManageBody>
    </RegionPage>
  );
}
