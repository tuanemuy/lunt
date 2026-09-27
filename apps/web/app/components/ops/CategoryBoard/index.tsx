"use client";

import {
  useActionState,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ManageBody,
  ManageSection,
  ManageStatus,
} from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/ChipButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import {
  addCategoryFn,
  renameCategoryFn,
  retireCategoryFn,
} from "@/presentation/categories";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import type { CategoryOption } from "@/presentation/listingView";
import { newId } from "@/presentation/newId";
import { useReconcile } from "@/presentation/reconcile";

type Row = CategoryOption & Readonly<{ pending?: boolean }>;

type OptimisticAction =
  | Readonly<{ type: "add"; row: Row }>
  | Readonly<{ type: "rename"; id: string; name: string }>
  | Readonly<{ type: "retire"; id: string }>;

function applyAction(
  current: readonly Row[],
  action: OptimisticAction,
): readonly Row[] {
  switch (action.type) {
    case "add":
      // A reconcile may land the real row under a still-pending add.
      return current.some((row) => row.id === action.row.id)
        ? current
        : [...current, action.row];
    case "rename":
      return current.map((row) =>
        row.id === action.id
          ? { ...row, name: action.name, pending: true }
          : row,
      );
    case "retire":
      return current.filter((row) => row.id !== action.id);
  }
}

type Outcome =
  | Readonly<{ kind: "added"; name: string }>
  | Readonly<{ kind: "renamed"; from: string; to: string }>
  | Readonly<{ kind: "retired"; name: string; successor: string }>
  | Readonly<{ kind: "failed"; error: ErrorState }>;

type Panel =
  | Readonly<{ kind: "rename"; category: CategoryOption }>
  | Readonly<{ kind: "retire"; category: CategoryOption }>
  | null;

type AddState = Readonly<{ name: string; error: string | null }>;

/** The add whose outcome is not known to be final, resent with the same id. */
type Attempt = { id: string; name: string };

const fieldMessage = (error: ErrorState): string =>
  error.kind === "invalidInput"
    ? (Object.values(error.fieldErrors).flat()[0] ?? error.message)
    : error.message;

/**
 * OM-06 カテゴリーの管理 (OPE-02, OPE-03): the active categories in creation
 * order, added at the end, renamed, and retired onto a successor (CS-12).
 * The board owns the list, so additions and retirements show at once and
 * the reconcile brings the stored catalog.
 */
export function CategoryBoard({
  categories,
}: {
  categories: readonly CategoryOption[];
}) {
  const reconcile = useReconcile();
  const [rows, applyOptimistic] = useOptimistic<
    readonly Row[],
    OptimisticAction
  >(categories, applyAction);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const attempt = useRef<Attempt | null>(null);

  const [addState, add, adding] = useActionState(
    async (_previous: AddState, form: FormData): Promise<AddState> => {
      const name = String(form.get("name") ?? "");
      if (name.trim() === "") return { name, error: "名称を入力してください" };
      if (attempt.current?.name !== name.trim()) {
        attempt.current = { id: newId(), name: name.trim() };
      }
      const { id } = attempt.current;
      applyOptimistic({
        type: "add",
        row: { id, name: name.trim(), pending: true },
      });
      try {
        await addCategoryFn({ data: { categoryId: id, name } });
        attempt.current = null;
        setOutcome({ kind: "added", name: name.trim() });
        await reconcile();
        return { name: "", error: null };
      } catch (error) {
        const state = classifyError(error);
        if (state.kind === "invalidInput") {
          return { name, error: fieldMessage(state) };
        }
        setOutcome({ kind: "failed", error: state });
        return { name, error: null };
      }
    },
    { name: "", error: null },
  );

  const single = rows.length <= 1;
  return (
    <ManageBody>
      <ManageStatus>{`現役のカテゴリー ${rows.length}つ`}</ManageStatus>
      {outcome === null ? null : outcome.kind === "failed" ? (
        <Alert
          title={
            outcome.error.kind === "premiseChanged"
              ? "操作を反映できませんでした"
              : outcome.error.kind === "conflict"
                ? "ほかのサービス運営者が先にカテゴリーを変えていました"
                : "保存できませんでした"
          }
        >
          {outcome.error.kind === "premiseChanged"
            ? `${outcome.error.message}。変更も付け替えも反映していません。最新の一覧を示しています。`
            : outcome.error.kind === "failed"
              ? "通信を確かめて、もう一度操作してください。入力した名称は残っています。"
              : outcome.error.kind === "conflict"
                ? "この変更は保存していません。最新の一覧を示しています。もう一度操作してください。"
                : outcome.error.message}
        </Alert>
      ) : (
        <div role="status">
          <Notice
            variant="manage"
            title={
              outcome.kind === "added"
                ? `「${outcome.name}」を追加しました`
                : outcome.kind === "renamed"
                  ? `「${outcome.from}」を「${outcome.to}」に変更しました`
                  : `「${outcome.name}」を廃止しました`
            }
          >
            {outcome.kind === "added"
              ? "並びの最後に入りました。掲載と絞り込みの選択肢に表示されます。"
              : outcome.kind === "renamed"
                ? "掲載のカテゴリーは変わりません。閲覧者には新しい名称で表示されます。"
                : `「${outcome.name}」を設定したすべての掲載を「${outcome.successor}」に付け替えました。申請の内容にある「${outcome.name}」は「${outcome.successor}」として示します。`}
          </Notice>
        </div>
      )}

      <form
        className="m-section"
        action={add}
        noValidate
        aria-labelledby="om06-add"
      >
        <SectionTitle variant="manage" id="om06-add">
          カテゴリーを追加
        </SectionTitle>
        <Field
          id="om06-add-name"
          label="名称"
          requirement="required"
          help="追加したカテゴリーは、並びの最後に入ります。"
          {...(addState.error === null ? {} : { error: addState.error })}
        >
          {(control) => (
            <div className="m-inline">
              <Input
                {...control}
                key={addState.name}
                name="name"
                placeholder="例: 泊まる"
                maxLength={100}
                defaultValue={addState.name}
              />
              <Button type="submit" variant="secondary" disabled={adding}>
                {adding ? "追加しています…" : "追加する"}
              </Button>
            </div>
          )}
        </Field>
      </form>

      <hr className="m-divider" />

      <ManageSection id="om06-list" title="現役のカテゴリー">
        <p className="m-field__help">
          作成した順に並びます。並び順を変える操作と、廃止を取り消す操作はありません。
        </p>
        <table className="om-table">
          <thead>
            <tr>
              <th scope="col">順</th>
              <th scope="col">名称</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td data-label="順">
                  <span>{index + 1}</span>
                </td>
                <th scope="row">
                  <span className="om-table__title">
                    {row.name}{" "}
                    {row.pending === true ? (
                      <Badge tone="accent">保存中</Badge>
                    ) : null}
                    {panel?.category.id === row.id ? (
                      <Badge
                        tone={panel.kind === "retire" ? "alert" : "accent"}
                      >
                        {panel.kind === "retire" ? "廃止する" : "変更中"}
                      </Badge>
                    ) : null}
                  </span>
                </th>
                <td className="om-table__ops">
                  <div className="om-table__opsbox">
                    <ChipButton
                      disabled={row.pending === true}
                      onClick={() =>
                        setPanel({ kind: "rename", category: row })
                      }
                    >
                      名称を変更
                    </ChipButton>
                    {single ? null : (
                      <ChipButton
                        disabled={row.pending === true}
                        onClick={() =>
                          setPanel({ kind: "retire", category: row })
                        }
                      >
                        廃止する
                      </ChipButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {single ? (
          <Notice
            variant="manage"
            tone="paper"
            title="このカテゴリーは廃止できません"
          >
            カテゴリーが1つだけで、掲載の移行先にできるカテゴリーがありません。カテゴリーを追加してから廃止します。
          </Notice>
        ) : null}
      </ManageSection>

      {panel?.kind === "rename" ? (
        <RenamePanel
          key={panel.category.id}
          category={panel.category}
          onDone={(from, to) => {
            setPanel(null);
            setOutcome({ kind: "renamed", from, to });
          }}
          onFailed={(error) => {
            setOutcome({ kind: "failed", error });
            setPanel(null);
          }}
          onCancel={() => setPanel(null)}
          applyOptimistic={applyOptimistic}
        />
      ) : null}
      {panel?.kind === "retire" ? (
        <RetirePanel
          key={panel.category.id}
          category={panel.category}
          candidates={rows.filter(
            (row) => row.id !== panel.category.id && row.pending !== true,
          )}
          onDone={(name, successor) => {
            setPanel(null);
            setOutcome({ kind: "retired", name, successor });
          }}
          onFailed={(error) => {
            setPanel(null);
            setOutcome({ kind: "failed", error });
          }}
          onCancel={() => setPanel(null)}
          applyOptimistic={applyOptimistic}
        />
      ) : null}
    </ManageBody>
  );
}

type PanelProps = {
  category: CategoryOption;
  onCancel: () => void;
  onFailed: (error: ErrorState) => void;
  applyOptimistic: (action: OptimisticAction) => void;
};

function RenamePanel({
  category,
  onDone,
  onFailed,
  onCancel,
  applyOptimistic,
}: PanelProps & { onDone: (from: string, to: string) => void }) {
  const reconcile = useReconcile();
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const dirty = name !== category.name;
  return (
    <form
      className="m-section om06-panel"
      noValidate
      aria-labelledby="om06-rename"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() === "") {
          setError("名称を入力してください");
          return;
        }
        startSave(async () => {
          applyOptimistic({
            type: "rename",
            id: category.id,
            name: name.trim(),
          });
          try {
            await renameCategoryFn({ data: { categoryId: category.id, name } });
            onDone(category.name, name.trim());
            await reconcile();
          } catch (caught) {
            const state = classifyError(caught);
            if (state.kind === "invalidInput") setError(fieldMessage(state));
            else onFailed(state);
            await reconcile();
          }
        });
      }}
    >
      <SectionTitle variant="manage" id="om06-rename">
        {`「${category.name}」の名称を変更`}
      </SectionTitle>
      <Field
        id="om06-rename-name"
        label="新しい名称"
        requirement="required"
        help="名称を変えても、掲載のカテゴリーは変わりません。閲覧者には新しい名称で表示されます。"
        {...(error === null ? {} : { error })}
      >
        {(control) => (
          <Input
            {...control}
            name="name"
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        )}
      </Field>
      {dirty ? (
        <p className="m-actions__note">
          保存していない変更があります。保存せずに離れると、変更は残りません。
        </p>
      ) : null}
      <div className="om-buttons">
        <Button type="submit" disabled={saving}>
          {saving ? "保存しています…" : "名称を保存"}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          やめる
        </Button>
      </div>
    </form>
  );
}

function RetirePanel({
  category,
  candidates,
  onDone,
  onFailed,
  onCancel,
  applyOptimistic,
}: PanelProps & {
  candidates: readonly CategoryOption[];
  onDone: (name: string, successor: string) => void;
}) {
  const reconcile = useReconcile();
  const [successorId, setSuccessorId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [retiring, startRetire] = useTransition();
  const successor = candidates.find(
    (candidate) => candidate.id === successorId,
  );

  const retire = () => {
    setConfirming(false);
    if (successor === undefined) return;
    startRetire(async () => {
      applyOptimistic({ type: "retire", id: category.id });
      try {
        await retireCategoryFn({
          data: { categoryId: category.id, successorId: successor.id },
        });
        onDone(category.name, successor.name);
        await reconcile();
      } catch (caught) {
        onFailed(classifyError(caught));
        await reconcile();
      }
    });
  };

  return (
    <form
      className="m-section om06-panel"
      noValidate
      aria-labelledby="om06-retire"
      onSubmit={(event) => {
        event.preventDefault();
        if (successor === undefined) {
          setError(
            "移行先を選んでください。掲載と申請が1件もなくても、移行先は必要です。",
          );
          return;
        }
        setError(null);
        setConfirming(true);
      }}
    >
      <SectionTitle variant="manage" id="om06-retire">
        {`「${category.name}」を廃止`}
      </SectionTitle>
      <Field
        id="om06-successor"
        label="移行先のカテゴリー"
        requirement="required"
        help={`「${category.name}」を設定した掲載は、選んだカテゴリーに付け替わります。`}
        {...(error === null ? {} : { error })}
      >
        {(control) => (
          <Select
            {...control}
            name="successor"
            value={successorId}
            onChange={(event) => setSuccessorId(event.currentTarget.value)}
          >
            <option value="">選ぶ</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="om-buttons">
        <Button type="submit" disabled={retiring}>
          {retiring ? "廃止しています…" : "廃止する"}
        </Button>
        <Button variant="secondary" disabled={retiring} onClick={onCancel}>
          やめる
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={`「${category.name}」を廃止しますか`}
        confirmLabel="廃止する"
        pending={retiring}
        onConfirm={retire}
        onCancel={() => setConfirming(false)}
      >
        <p>{`廃止するカテゴリー: ${category.name} → 移行先: ${successor?.name ?? ""}`}</p>
        <ul>
          <li>{`「${category.name}」を設定したすべての掲載が「${successor?.name ?? ""}」に付け替わります`}</li>
          <li>{`掲載の申請・修正の申請の内容にある「${category.name}」は、申請の状態を問わず「${successor?.name ?? ""}」として読み替わります`}</li>
          <li>{`「${category.name}」は、カテゴリーの選択肢から消えます`}</li>
          <li>廃止は取り消せません</li>
        </ul>
      </ConfirmDialog>
    </form>
  );
}
