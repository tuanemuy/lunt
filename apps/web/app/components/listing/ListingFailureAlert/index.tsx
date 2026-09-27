"use client";

import type { ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import type { ErrorState } from "@/presentation/errorState";
import {
  LISTING_FIELD_ANCHOR,
  LISTING_FIELD_LABEL,
  LISTING_FIELDS,
  type ListingFieldErrors,
} from "@/presentation/listingForm";

export type ListingFailure = Readonly<{
  state: ErrorState;
  fields: ListingFieldErrors;
  /** What was attempted, which words the alert. */
  attempt: "save" | "publish" | "operation";
  /** The content was saved before the publish failed. */
  savedFirst?: boolean;
}>;

type ListingFailureAlertProps = {
  failure: ListingFailure;
  placeId: string;
  /** An operator standing in for an absent steward (CS-15 on `forbidden`). */
  proxy: boolean;
  /** 最新の内容を読み直す (CS-07). */
  onReload: () => void;
  /** もう一度 (CS-02): resubmits the form or reruns the operation. */
  retry: ReactNode;
  busy: boolean;
};

/**
 * The alert above SM-04's form after a failed save, publish or state
 * change: CS-15, CS-07, CS-08, CS-10 (the fields to fix, the publish
 * condition's missing items) and CS-02.
 */
export function ListingFailureAlert({
  failure,
  placeId,
  proxy,
  onReload,
  retry,
  busy,
}: ListingFailureAlertProps) {
  const { state, fields, attempt } = failure;
  if (state.kind === "forbidden" && proxy) {
    return (
      <Alert
        title="この店舗は代行できません"
        actions={
          <ButtonLink
            variant="secondary"
            to="/ops/subjects/$kind/$id"
            params={{ kind: "place", id: placeId }}
          >
            店舗の運営へ戻る
          </ButtonLink>
        }
      >
        この店舗には店舗管理者が就きました。変更は反映していません。店舗の運営の画面で、管理者がいることを確かめてください。
      </Alert>
    );
  }
  if (state.kind === "conflict") {
    return (
      <Alert
        title="ほかの管理者が先にこの掲載を保存していました"
        actions={
          <Button variant="secondary" disabled={busy} onClick={onReload}>
            最新の内容を読み直す
          </Button>
        }
      >
        この変更は反映していません。最新の内容を読み直してから、もう一度操作してください。
      </Alert>
    );
  }
  if (state.kind === "premiseChanged") {
    return (
      <Alert title="操作を反映できませんでした">
        {`${state.message}。現在の状態を示しています。`}
      </Alert>
    );
  }
  if (state.kind === "invalidInput") {
    const listed = LISTING_FIELDS.filter(
      (field) => fields[field] !== undefined,
    );
    const publishing = state.missing.length > 0;
    return (
      <Alert
        title={publishing ? "公開できませんでした" : "保存できませんでした"}
        list={listed.map((field) => (
          <li key={field}>
            <a className="text-button" href={`#${LISTING_FIELD_ANCHOR[field]}`}>
              {LISTING_FIELD_LABEL[field]}
            </a>
          </li>
        ))}
      >
        {publishing
          ? `写真・名称・カテゴリーは、掲載を公開するための条件です。次の項目を直してください。${failure.savedFirst === true ? "内容は保存しました。" : ""}`
          : listed.length === 0
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
            : "操作できませんでした"
      }
      actions={retry}
    >
      {state.kind === "failed"
        ? "通信を確かめて、もう一度お試しください。入力した内容は残っています。"
        : state.message}
    </Alert>
  );
}
