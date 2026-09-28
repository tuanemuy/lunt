"use client";

import { useState, useTransition } from "react";
import { ManageStatus } from "@/components/layout/ManageShell";
import { placePagePath } from "@/components/manage/ShopShell";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TextLink } from "@/components/ui/TextButton";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { changeOperatingStatusFn } from "@/presentation/place";
import {
  OPERATING_STATUS_LABEL,
  OPERATING_STATUSES,
  type OperatingStatus,
} from "@/presentation/placeView";
import { useReconcile } from "@/presentation/reconcile";

const CHANGED_TEXT = {
  open: "店舗と掲載は、営業中として表示されています。",
  temporarilyClosed:
    "店舗と掲載は、休業中として表示されています。掲載はフィードの対象のままです。",
  permanentlyClosed:
    "店舗と掲載は、フィード・地図・地域やイベントの一覧に表示されなくなりました。検索・保存・詳細では閉店として表示されます。",
} as const satisfies Readonly<Record<OperatingStatus, string>>;

type OperatingStatusPanelProps = {
  placeId: string;
  /** The version the editor's form was read at; the change moves it. */
  version: number;
  current: OperatingStatus;
  proxy: boolean;
  /** The store is suspended (its viewers see nothing until it is lifted). */
  suspended: boolean;
  /** The change went through at `version`. */
  onChanged: (version: number) => void;
  /** 最新の内容を読み直す after CS-07: the editor starts again from the server's copy. */
  onReload: () => void;
  onLostAccess: () => void;
};

/**
 * SM-02 営業状況: changed on its own, apart from saving the profile. 休業
 * and 閉店 reduce what viewers see, so they are confirmed first (CS-12);
 * returning to 営業中 is not.
 */
export function OperatingStatusPanel({
  placeId,
  version,
  current,
  proxy,
  suspended,
  onChanged,
  onReload,
  onLostAccess,
}: OperatingStatusPanelProps) {
  const reconcile = useReconcile();
  const [picked, setPicked] = useState<OperatingStatus>(current);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<ErrorState | null>(null);
  const [changed, setChanged] = useState<OperatingStatus | null>(null);
  const [changing, startChange] = useTransition();

  const change = () => {
    setConfirming(false);
    setFailure(null);
    setChanged(null);
    startChange(async () => {
      try {
        const reply = await changeOperatingStatusFn({
          data: { placeId, version, status: picked },
        });
        onChanged(reply.version);
        setChanged(reply.operatingStatus);
        await reconcile();
      } catch (error) {
        const state = classifyError(error);
        if (state.kind === "forbidden" && !proxy) {
          onLostAccess();
          return;
        }
        setFailure(state);
      }
    });
  };

  return (
    <section className="m-section" aria-labelledby="sm02-status">
      <SectionTitle variant="manage" id="sm02-status">
        営業状況
      </SectionTitle>
      <div role="status">
        {changed === null ? null : (
          <Notice
            variant="manage"
            title={`営業状況を${OPERATING_STATUS_LABEL[changed]}にしました`}
            {...(suspended
              ? {}
              : {
                  actions: (
                    <TextLink to={placePagePath(placeId)}>
                      店舗ページを見る
                    </TextLink>
                  ),
                })}
          >
            {CHANGED_TEXT[changed]}
          </Notice>
        )}
      </div>
      {failure === null ? null : (
        <Alert
          title={
            failure.kind === "conflict"
              ? "ほかの人が先に店舗情報を変えていました"
              : failure.kind === "forbidden"
                ? "この店舗は代行できません"
                : "営業状況を変更できませんでした"
          }
          {...(failure.kind === "conflict"
            ? {
                actions: (
                  <Button
                    variant="secondary"
                    disabled={changing}
                    onClick={() =>
                      startChange(async () => {
                        onReload();
                        await reconcile();
                        setFailure(null);
                      })
                    }
                  >
                    最新の内容を読み直す
                  </Button>
                ),
              }
            : {})}
        >
          {failure.kind === "conflict"
            ? "営業状況は変更していません。最新の内容を読み直してから、もう一度変更してください。"
            : failure.kind === "forbidden"
              ? "この店舗には店舗管理者が就きました。営業状況は変更していません。"
              : failure.kind === "failed"
                ? "通信を確かめて、もう一度変更してください。"
                : failure.message}
        </Alert>
      )}
      <ManageStatus tone={current === "open" ? "accent" : "neutral"}>
        {`現在の営業状況: ${OPERATING_STATUS_LABEL[current]}`}
      </ManageStatus>
      <ChoiceGroup
        legend="変更後の営業状況"
        name="operatingStatus"
        choices={OPERATING_STATUSES.map((status) => ({
          value: status,
          label: OPERATING_STATUS_LABEL[status],
        }))}
        value={picked}
        onChange={setPicked}
        help="営業状況は、店舗情報の保存とは別に、確定した時点で反映します。休業・閉店にするときは、確定の前に閲覧者への見え方を確かめます。"
      />
      <Button
        variant="secondary"
        disabled={picked === current || changing}
        onClick={() => (picked === "open" ? change() : setConfirming(true))}
      >
        {changing ? "変更しています…" : "営業状況を変更"}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={
          picked === "permanentlyClosed" ? "閉店にしますか" : "休業にしますか"
        }
        confirmLabel={
          picked === "permanentlyClosed" ? "閉店にする" : "休業にする"
        }
        pending={changing}
        onConfirm={change}
        onCancel={() => setConfirming(false)}
      >
        <p>確定すると、すぐに閲覧者への表示が変わります。</p>
        {picked === "permanentlyClosed" ? (
          <ul>
            <li>
              店舗と掲載は、フィード・地図・地域やイベントの一覧に表示されなくなります
            </li>
            <li>検索・保存・店舗と掲載の詳細では、閉店として表示されます</li>
            <li>掲載の公開状態と提供状態は変わりません</li>
          </ul>
        ) : (
          <ul>
            <li>店舗と掲載は、どの画面でも休業中として表示されます</li>
            <li>掲載は、フィードの対象のままです</li>
            <li>掲載の公開状態と提供状態は変わりません</li>
          </ul>
        )}
      </ConfirmDialog>
    </section>
  );
}
