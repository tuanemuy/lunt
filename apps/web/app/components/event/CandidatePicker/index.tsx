"use client";

import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/Button";
import { ChipButton, ChipLink } from "@/components/ui/ChipButton";
import { Field, Input } from "@/components/ui/Field";
import { Row } from "@/components/ui/Rows";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import type { CandidateItem, CandidatePage } from "@/presentation/occasionView";

type CandidateSearchProps = {
  /** The search field's id. */
  id: string;
  label: string;
  placeholder: string;
  help: string;
  /** Runs the search (a server function); a blank keyword finds nothing. */
  search: (keyword: string) => Promise<CandidatePage>;
  /** The viewer-side detail of a candidate (CF-02: 候補から詳細を開いて確かめられる). */
  detailPath: (id: string) => string;
  detailLabel: string;
  onPick: (item: CandidateItem) => void;
  /** Extra operations beside a candidate that cannot be chosen (CM-04: 参加内容を変更). */
  refusedAction?: (item: CandidateItem) => ReactNode;
  disabled?: boolean;
  /** Focus the field when shown (a dialog's first control). */
  autoFocus?: boolean;
  /** What a search that found nothing says, in place of the generic line (RQ-06: 参加を申請できるイベントがない). */
  noMatch?: (keyword: string) => ReactNode;
  /** The search as it stood when the input was kept (RQ-06: a return from a candidate's detail). */
  initial?: CandidateSnapshot | null;
  /** Receives the search as it stands, to keep it with the input. */
  keep?: (snapshot: CandidateSnapshot) => void;
};

/** A search as it stood: what is typed, and what the last search found. */
export type CandidateSnapshot = Readonly<{
  keyword: string;
  found: Readonly<{ keyword: string; page: CandidatePage }> | null;
}>;

type Result =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "found"; keyword: string; page: CandidatePage }>
  | Readonly<{ kind: "failed"; error: ErrorState }>;

/**
 * CF-02 対象の選択: a keyword search whose candidates come with their state
 * and, when the calling operation refuses one, the reason; each opens its
 * viewer detail. Choosing hands the candidate back; leaving changes nothing.
 */
export function CandidateSearch({
  id,
  label,
  placeholder,
  help,
  search,
  detailPath,
  detailLabel,
  onPick,
  refusedAction,
  disabled = false,
  autoFocus = false,
  noMatch,
  initial = null,
  keep,
}: CandidateSearchProps) {
  const [keyword, setKeyword] = useState(initial?.keyword ?? "");
  const [result, setResult] = useState<Result>(
    initial === null || initial.found === null
      ? { kind: "idle" }
      : { kind: "found", ...initial.found },
  );
  const [searching, startSearch] = useTransition();
  useEffect(() => {
    keep?.({
      keyword,
      found:
        result.kind === "found"
          ? { keyword: result.keyword, page: result.page }
          : null,
    });
  }, [keep, keyword, result]);
  const run = () =>
    startSearch(async () => {
      const typed = keyword.trim();
      if (typed === "") {
        setResult({
          kind: "found",
          keyword: "",
          page: { items: [], count: 0 },
        });
        return;
      }
      try {
        setResult({ kind: "found", keyword: typed, page: await search(typed) });
      } catch (error) {
        setResult({ kind: "failed", error: classifyError(error) });
      }
    });
  const fieldError =
    result.kind === "failed" && result.error.kind === "invalidInput"
      ? result.error.message
      : undefined;
  return (
    <search className="em-search">
      <Field
        id={id}
        label={label}
        help={help}
        {...(fieldError === undefined ? {} : { error: fieldError })}
      >
        {(control) => (
          <div className="m-inline">
            <Input
              {...control}
              type="search"
              value={keyword}
              placeholder={placeholder}
              disabled={disabled}
              autoFocus={autoFocus}
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
        )}
      </Field>
      <div role="status" aria-busy={searching}>
        {result.kind === "failed" && fieldError === undefined ? (
          <p className="m-field__error">
            {result.error.kind === "failed"
              ? "探せませんでした。通信を確かめて、もう一度探してください。"
              : result.error.message}
          </p>
        ) : result.kind === "found" ? (
          result.keyword === "" ? (
            <p className="m-field__help">キーワードを入力して探します。</p>
          ) : result.page.items.length === 0 ? (
            (noMatch?.(result.keyword) ?? (
              <p className="m-field__help">
                {`「${result.keyword}」に当たる候補はありません。別のキーワードで探してください。`}
              </p>
            ))
          ) : (
            <p className="m-field__label">{`候補 ${result.page.count}件`}</p>
          )
        ) : null}
      </div>
      {result.kind === "found" && result.page.items.length > 0 ? (
        <ul className="em-candidates">
          {result.page.items.map((item) => (
            <li key={item.id} className="em-candidate">
              <Row
                photo={
                  item.photoUrl === null
                    ? null
                    : { src: item.photoUrl, alt: "" }
                }
                name={item.name}
                meta={item.meta}
                {...(item.refusal === null
                  ? {}
                  : {
                      sub: <span className="em-reason">{item.refusal}</span>,
                    })}
              />
              <div className="p-item__ops">
                <ChipLink to={detailPath(item.id)}>{detailLabel}</ChipLink>
                {item.refusal === null ? (
                  <ChipButton
                    disabled={disabled}
                    aria-label={`${item.name}を選ぶ`}
                    onClick={() => onPick(item)}
                  >
                    選ぶ
                  </ChipButton>
                ) : (
                  (refusedAction?.(item) ?? (
                    <ChipButton
                      disabled
                      aria-label={`${item.name}は選べません`}
                    >
                      選ぶ
                    </ChipButton>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </search>
  );
}

/** CF-02 in a modal: the search above, 選ばずに戻る below. */
export function CandidateDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the backdrop click mirrors Escape, which `onCancel` already handles for keyboards
    <dialog
      ref={ref}
      className="m-dialog em-picker"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="m-dialog__panel">
        <h2 className="m-dialog__title" id={titleId}>
          {title}
        </h2>
        {open ? children : null}
        <div className="m-dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            選ばずに戻る
          </Button>
        </div>
      </div>
    </dialog>
  );
}
