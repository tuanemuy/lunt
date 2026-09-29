"use client";

import { type ReactNode, useState, useTransition } from "react";
import { ManageBody, ManagePage } from "@/components/layout/ManageShell";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Input } from "@/components/ui/Field";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Row, RowLink } from "@/components/ui/Rows";
import { TextLink } from "@/components/ui/TextButton";
import {
  affiliationStatusPath,
  type CandidateRefusal,
  type RelationRefusal,
  refusalLinkOf,
  type StateBadge,
  shopParticipationPath,
} from "@/presentation/applyRelationsView";
import { applicationPath } from "@/presentation/applyView";
import { classifyError } from "@/presentation/errorState";
import { ApplyTitle, RefusalPanel, type RefusedWhat } from "../ApplyParts";

/** One choice of a candidate list (RQ-05's `rq05-cand`). */
export type RadioCandidate = Readonly<{
  id: string;
  name: string;
  meta: string;
  photoUrl?: string | null;
  badges?: readonly StateBadge[];
  refusal: CandidateRefusal | null;
  /** The viewer-side detail (CF-02: 候補から詳細を開いて確かめられる). */
  detailHref: string | null;
}>;

/**
 * A radio list of candidates (CF-02 in RQ-05): each row chooses, a
 * candidate that cannot be chosen is shown disabled with its reason and
 * where the reason leads, and the viewer detail opens beside it.
 */
export function CandidateRadios({
  name,
  items,
  value,
  onChange,
  disabled = false,
  labelledBy,
  invalid = false,
  describedBy,
  id,
}: {
  name: string;
  items: readonly RadioCandidate[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  labelledBy?: string;
  invalid?: boolean;
  describedBy?: string;
  id?: string;
}) {
  return (
    <ul className="rq05-cands" aria-labelledby={labelledBy} id={id}>
      {items.map((item) => {
        const refused = item.refusal !== null && item.id !== value;
        const link =
          item.refusal?.go === null || item.refusal?.go === undefined
            ? null
            : refusalLinkOf(item.refusal.go);
        return (
          <li
            key={item.id}
            className="rq05-cand"
            {...(refused ? { "data-disabled": "" } : {})}
          >
            <label className="rq05-cand__main">
              <input
                type="radio"
                name={name}
                value={item.id}
                checked={item.id === value}
                disabled={disabled || refused}
                aria-invalid={invalid ? true : undefined}
                aria-describedby={describedBy}
                onChange={() => onChange(item.id)}
              />
              <span className="rq05-cand__text">
                <span className="rq05-cand__name">
                  {item.name}
                  {item.refusal?.badge === null ||
                  item.refusal?.badge === undefined ? null : (
                    <Badge tone="muted">{item.refusal.badge}</Badge>
                  )}
                  {(item.badges ?? []).map((badge) => (
                    <Badge key={badge.label} tone={badge.tone}>
                      {badge.label}
                    </Badge>
                  ))}
                </span>
                {item.meta === "" ? null : (
                  <span className="rq05-cand__meta">{item.meta}</span>
                )}
                {item.refusal === null ? null : (
                  <span className="rq05-cand__reason">
                    {item.refusal.reason}
                  </span>
                )}
              </span>
            </label>
            {link !== null ? (
              <TextLink className="rq05-cand__link" to={link.href}>
                {link.label}
              </TextLink>
            ) : item.detailHref === null ? null : (
              <TextLink className="rq05-cand__link" to={item.detailHref}>
                詳細を見る
              </TextLink>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type Found<T> =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "found"; keyword: string; items: readonly T[] }>
  | Readonly<{ kind: "failed"; message: string }>;

/**
 * A keyword field and 探す (CF-02); the results are drawn by `children`.
 * A blank keyword finds nothing.
 */
export function KeywordSearch<T>({
  label,
  placeholder,
  disabled = false,
  search,
  children,
}: {
  label: string;
  placeholder: string;
  disabled?: boolean;
  search: (keyword: string) => Promise<readonly T[]>;
  children: (items: readonly T[]) => ReactNode;
}) {
  const [keyword, setKeyword] = useState("");
  const [found, setFound] = useState<Found<T>>({ kind: "idle" });
  const [searching, startSearch] = useTransition();
  const run = () =>
    startSearch(async () => {
      const typed = keyword.trim();
      if (typed === "") {
        setFound({ kind: "found", keyword: "", items: [] });
        return;
      }
      try {
        setFound({ kind: "found", keyword: typed, items: await search(typed) });
      } catch (error) {
        const failed = classifyError(error);
        setFound({
          kind: "failed",
          message:
            failed.kind === "failed"
              ? "探せませんでした。通信を確かめて、もう一度探してください。"
              : failed.message,
        });
      }
    });
  return (
    <div className="rq05-search">
      <div className="m-inline">
        <Input
          type="search"
          value={keyword}
          placeholder={placeholder}
          aria-label={label}
          disabled={disabled}
          onChange={(event) => setKeyword(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              run();
            }
          }}
        />
        <Button
          variant="secondary"
          disabled={disabled || searching}
          onClick={run}
        >
          {searching ? "探しています…" : "探す"}
        </Button>
      </div>
      <div role="status" aria-busy={searching}>
        {found.kind === "failed" ? (
          <p className="m-field__error">{found.message}</p>
        ) : found.kind === "found" ? (
          found.keyword === "" ? (
            <p className="m-field__help">キーワードを入力して探します。</p>
          ) : found.items.length === 0 ? (
            <p className="m-field__help">
              {`「${found.keyword}」に当たる候補はありません。別のキーワードで探してください。`}
            </p>
          ) : null
        ) : null}
      </div>
      {found.kind === "found" && found.items.length > 0
        ? children(found.items)
        : null}
    </div>
  );
}

/**
 * 「受け付けない」 of RQ-05 / RQ-06 (`spec/pages/index.md` 「受け付けない事情」):
 * the reason and its destinations. `onChooseAgain` returns to the input
 * to choose another region or event, when the reason allows it.
 */
export function RelationRefusalPanel({
  refusal,
  what,
  onChooseAgain,
}: {
  refusal: RelationRefusal;
  what: Extract<RefusedWhat, "membership" | "participation">;
  onChooseAgain?: () => void;
}) {
  const target = what === "membership" ? "地域" : "イベント";
  const again =
    onChooseAgain === undefined ? null : (
      <Button onClick={onChooseAgain}>{`別の${target}を選ぶ`}</Button>
    );
  switch (refusal.kind) {
    case "notSteward":
      if (refusal.atSubmit) {
        return (
          <EmptyPanel
            title={`${refusal.placeName}の店舗管理者ではありません`}
            actions={
              <>
                <ButtonLink to="/me">マイページへ戻る</ButtonLink>
                {refusal.vacant ? (
                  <ButtonLink
                    variant="secondary"
                    to="/places/$placeId"
                    params={{ placeId: refusal.placeId }}
                  >
                    店舗ページから申請する
                  </ButtonLink>
                ) : null}
              </>
            }
          >
            {`店舗管理者としての申請は、その店舗の管理権限を持つ人だけが行えます。申請は提出していません。${refusal.vacant ? `${refusal.placeName}には店舗管理者がいないため、所属と離脱は店舗ページから個人として申請できます。` : ""}`}
          </EmptyPanel>
        );
      }
      if (what === "participation") {
        return (
          <EmptyPanel
            title="この店舗の店舗管理者ではありません"
            actions={
              <>
                <ButtonLink to="/me">マイページへ</ButtonLink>
                <ButtonLink
                  variant="secondary"
                  to="/places/$placeId"
                  params={{ placeId: refusal.placeId }}
                >
                  店舗ページを見る
                </ButtonLink>
              </>
            }
          >
            {`${refusal.placeName}の管理権限がないため、参加を申請できません。参加の申請は、店舗管理者だけが行えます。店舗の関係者は、店舗ページから管理権限を申請できます。`}
          </EmptyPanel>
        );
      }
      return refusal.vacant ? (
        <EmptyPanel
          title="この店舗の店舗管理者ではありません"
          actions={
            <ButtonLink
              to="/places/$placeId"
              params={{ placeId: refusal.placeId }}
            >
              店舗ページから申請する
            </ButtonLink>
          }
        >
          {`${refusal.placeName}には店舗管理者がいません。所属と離脱は、店舗ページから個人として申請できます。`}
        </EmptyPanel>
      ) : (
        <EmptyPanel
          title="この店舗の店舗管理者ではありません"
          actions={
            <>
              <ButtonLink
                to="/apply/places/$placeId/stewardship"
                params={{ placeId: refusal.placeId }}
              >
                このお店の管理権限を申請する
              </ButtonLink>
              <ButtonLink
                variant="secondary"
                to="/places/$placeId"
                params={{ placeId: refusal.placeId }}
              >
                店舗ページを見る
              </ButtonLink>
            </>
          }
        >
          {`${refusal.placeName}の所属と離脱は、店舗管理者が申請します。店舗の関係者は、管理権限を申請できます。`}
        </EmptyPanel>
      );
    case "noManagedPlace":
      return (
        <EmptyPanel
          title="参加の申請は、店舗管理者だけが行えます"
          actions={
            <ButtonLink
              to="/events/$occasionId"
              params={{ occasionId: refusal.occasionId }}
            >
              イベントに戻る
            </ButtonLink>
          }
        >
          管理しているお店がありません。お店の関係者の方は、お店のページの「このお店を管理する」から管理権限を申請できます。
        </EmptyPanel>
      );
    case "affiliated":
      return (
        <EmptyPanel
          title={`${refusal.placeName}は、${refusal.regionName}に所属しています`}
          actions={
            again === null && !refusal.steward ? undefined : (
              <>
                {again}
                {refusal.steward ? (
                  <ButtonLink
                    variant="secondary"
                    to={affiliationStatusPath(refusal.placeId)}
                  >
                    所属地域の状況へ
                  </ButtonLink>
                ) : null}
              </>
            )
          }
        >
          所属中の地域への所属の申請は、受け付けていません。申請は提出していません。別の地域を選べます。
        </EmptyPanel>
      );
    case "notAffiliated":
      return (
        <EmptyPanel
          title="所属は解除されています"
          actions={
            refusal.steward ? (
              <ButtonLink to={affiliationStatusPath(refusal.placeId)}>
                所属地域の状況へ
              </ButtonLink>
            ) : (
              <ButtonLink
                to="/places/$placeId"
                params={{ placeId: refusal.placeId }}
              >
                店舗ページへ戻る
              </ButtonLink>
            )
          }
        >
          {`${refusal.placeName}と${refusal.regionName}の所属は、すでに解除されています。離脱の申請は要りません。`}
        </EmptyPanel>
      );
    case "targetUnavailable":
      return (
        <EmptyPanel
          title={`この${target}は閲覧できません`}
          {...(again === null ? {} : { actions: again })}
        >
          {`非公開になったなどで、この${target}は選べなくなりました。申請は提出していません。別の${target}を選んでください。`}
        </EmptyPanel>
      );
    case "occasionClosed":
      return (
        <EmptyPanel
          title="このイベントは終了したか中止になったため、申請できません"
          {...(again === null ? {} : { actions: again })}
        >
          {`${refusal.occasionName}は、終了したか中止になりました。申請は送っていません。開催前か開催中の、別のイベントを選んでください。`}
        </EmptyPanel>
      );
    case "participating":
      return (
        <EmptyPanel
          title={`${refusal.occasionName}には、すでに参加しています`}
          actions={
            <>
              <ButtonLink
                to={shopParticipationPath(refusal.placeId, refusal.occasionId)}
              >
                参加内容を変える
              </ButtonLink>
              {onChooseAgain === undefined ? null : (
                <Button variant="secondary" onClick={onChooseAgain}>
                  別のイベントを選ぶ
                </Button>
              )}
            </>
          }
        >
          参加中のイベントへの参加の申請は、受け付けていません。申請は送っていません。参加内容は、参加内容の編集で変えられます。
        </EmptyPanel>
      );
    case "activeRelation":
      return (
        <EmptyPanel
          title="同じ申請が確認中です"
          actions={
            <ButtonLink to={applicationPath(refusal.applicationId)}>
              申請の詳細を見る
            </ButtonLink>
          }
        >
          {`${refusal.what}が、確認中か差し戻しになっています。終わるまで、新しい申請は出せません。申請の詳細で、状況の確認と取り下げができます。`}
        </EmptyPanel>
      );
    default:
      return <RefusalPanel refusal={refusal} what={what} />;
  }
}

/** A screen whose application is refused (受け付けない), in its frame. */
export function RelationRefused({
  heading,
  refusal,
  what,
  onChooseAgain,
}: {
  heading: string;
  refusal: RelationRefusal;
  what: Extract<RefusedWhat, "membership" | "participation">;
  onChooseAgain?: () => void;
}) {
  return (
    <ManagePage title={<ApplyTitle heading={heading} />}>
      <ManageBody>
        <FocusOnMount role="alert">
          <RelationRefusalPanel
            refusal={refusal}
            what={what}
            {...(onChooseAgain === undefined ? {} : { onChooseAgain })}
          />
        </FocusOnMount>
      </ManageBody>
    </ManagePage>
  );
}

/** A store, region or event row that opens its viewer detail when it has one. */
export function TargetRow({
  name,
  meta,
  sub,
  photoUrl,
  href,
}: {
  name: string;
  meta?: string;
  sub?: ReactNode;
  photoUrl: string | null;
  href: string | null;
}) {
  const row = {
    photo: photoUrl === null ? null : { src: photoUrl, alt: "" },
    name,
    ...(meta === undefined || meta === "" ? {} : { meta }),
    ...(sub === undefined || sub === "" ? {} : { sub }),
  };
  return href === null ? <Row {...row} /> : <RowLink to={href} {...row} />;
}
