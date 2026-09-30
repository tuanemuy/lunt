"use client";

import { useId, useLayoutEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/ChipButton";
import { Field, Input } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { findShowcaseCandidatesFn } from "@/presentation/editorial";
import {
  SHOWCASE_KIND_LABEL,
  SHOWCASE_KINDS,
  type ShowcaseCandidates,
  type ShowcaseItem,
  showcaseKey,
  showcaseNameText,
  showcasePagePath,
} from "@/presentation/editorialView";
import { classifyError, type ErrorState } from "@/presentation/errorState";

/** A viewer detail, opened beside the form so its unsaved input stays. */
function DetailChip({ item }: { item: ShowcaseItem }) {
  return (
    <a
      className="chip-button"
      href={showcasePagePath(item.kind, item.id)}
      target="_blank"
      rel="noopener"
      aria-label={`${showcaseNameText(item)}の詳細（新しいタブ）`}
    >
      詳細
    </a>
  );
}

function StateLine({ item }: { item: ShowcaseItem }) {
  return (
    <span className="am02-ref__state">
      {item.badge === null ? null : (
        <Badge tone={item.badge.tone}>{item.badge.text}</Badge>
      )}
      <span>{item.stateText}</span>
      {item.note === null ? null : <span>{item.note}</span>}
    </span>
  );
}

type Result =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "found"; keyword: string; found: ShowcaseCandidates }>
  | Readonly<{ kind: "failed"; error: ErrorState }>;

/**
 * CF-02 for 紹介先: a keyword finds listings, places, regions and events
 * viewers can see, each kind apart with its state; one already linked is
 * shown as such and cannot be chosen. Choosing hands the target back and
 * closes; leaving changes nothing.
 */
function ShowcasePicker({
  open,
  linked,
  onPick,
  onClose,
}: {
  open: boolean;
  linked: ReadonlySet<string>;
  onPick: (item: ShowcaseItem) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [searching, startSearch] = useTransition();
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const run = () =>
    startSearch(async () => {
      const typed = keyword.trim();
      if (typed === "") {
        setResult({ kind: "idle" });
        return;
      }
      try {
        const found = await findShowcaseCandidatesFn({
          data: { keyword: typed },
        });
        setResult({ kind: "found", keyword: typed, found });
      } catch (error) {
        setResult({ kind: "failed", error: classifyError(error) });
      }
    });

  const fieldError =
    result.kind === "failed" && result.error.kind === "invalidInput"
      ? result.error.message
      : undefined;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the backdrop click mirrors Escape, which `onCancel` already handles for keyboards
    <dialog
      ref={ref}
      className="m-dialog am02-picker"
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
          紹介先を選ぶ
        </h2>
        {open ? (
          <>
            <Field
              id="showcase-keyword"
              label="キーワード"
              help="閲覧者が閲覧できる掲載・店舗・地域・イベントから探します。"
              {...(fieldError === undefined ? {} : { error: fieldError })}
            >
              {(control) => (
                <div className="m-inline">
                  <Input
                    {...control}
                    type="search"
                    name="q"
                    value={keyword}
                    autoFocus
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
                    disabled={searching}
                    onClick={run}
                  >
                    {searching ? "探しています…" : "探す"}
                  </Button>
                </div>
              )}
            </Field>
            <div className="am02-cands" role="status" aria-busy={searching}>
              {result.kind === "failed" && fieldError === undefined ? (
                <p className="m-field__error">
                  {result.error.kind === "failed"
                    ? "探せませんでした。通信を確かめて、もう一度探してください。"
                    : result.error.message}
                </p>
              ) : null}
              {result.kind === "idle" ? (
                <p className="m-field__help">キーワードを入力して探します。</p>
              ) : null}
              {result.kind === "found"
                ? SHOWCASE_KINDS.map((kind) => {
                    const page = result.found[kind];
                    return (
                      <div key={kind} className="am02-cands">
                        <h3 className="am02-cands__head">
                          {page.count > page.items.length
                            ? `${SHOWCASE_KIND_LABEL[kind]}（上位${page.items.length}件 / ${page.count}件）`
                            : SHOWCASE_KIND_LABEL[kind]}
                        </h3>
                        {page.items.length === 0 ? (
                          <p className="am02-empty">
                            {`「${result.keyword}」に合う${SHOWCASE_KIND_LABEL[kind]}はありません。`}
                          </p>
                        ) : (
                          <ul className="am02-refs">
                            {page.items.map((item) => {
                              const taken = linked.has(showcaseKey(item));
                              const name = showcaseNameText(item);
                              return (
                                <li key={item.id} className="am02-ref">
                                  <span className="am02-ref__text">
                                    <span className="am02-ref__name">
                                      {name}
                                    </span>
                                    <span className="am02-ref__state">
                                      {item.badge === null ? null : (
                                        <Badge tone={item.badge.tone}>
                                          {item.badge.text}
                                        </Badge>
                                      )}
                                      <span>
                                        {taken
                                          ? `${item.stateText} · 結びつけ済みのため選べません`
                                          : item.stateText}
                                      </span>
                                    </span>
                                  </span>
                                  <span className="am02-ref__ops">
                                    <DetailChip item={item} />
                                    <ChipButton
                                      disabled={taken}
                                      aria-label={
                                        taken
                                          ? `${name}は結びつけ済みのため選べません`
                                          : `${name}を選ぶ`
                                      }
                                      onClick={() => onPick(item)}
                                    >
                                      選ぶ
                                    </ChipButton>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })
                : null}
            </div>
          </>
        ) : null}
        <div className="m-dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            選ばずにやめる
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * AM-02's 紹介先: the linked targets in the article's order with each
 * one's current state — those viewers cannot see marked as left out of
 * the article — moved up, removed, and added through CF-02. Changes take
 * effect when the article is saved.
 */
export function ShowcaseField({
  items,
  onChange,
  error,
  disabled = false,
}: {
  items: readonly ShowcaseItem[];
  onChange: (items: readonly ShowcaseItem[]) => void;
  error?: string;
  disabled?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const hidden = items.filter((item) => !item.viewable);
  const linked = new Set(items.map(showcaseKey));
  const move = (index: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    if (item === undefined) return;
    next.splice(index - 1, 0, item);
    onChange(next);
  };
  return (
    <section
      className="m-section"
      id="article-showcases"
      aria-labelledby="h-refs"
    >
      <div className="om-count">
        <SectionTitle variant="manage" id="h-refs">
          紹介先
        </SectionTitle>
        {items.length === 0 ? null : <Badge>{`${items.length}件`}</Badge>}
      </div>
      <p className="m-field__help">
        記事では、この順で紹介先を示します。紹介先は本文中の位置を持ちません。変更は、保存で反映します。
      </p>
      {hidden.length === 0 ? null : (
        <Notice
          variant="manage"
          tone="paper"
          title="閲覧者が閲覧できない紹介先があります"
        >
          {`${hidden
            .map((item) => `「${showcaseNameText(item)}」`)
            .join(
              "・",
            )}は記事に表示されません。結びつけを外すか、そのままにできます。再び閲覧できるようになると、記事に再び表示されます。保存と公開はできます。`}
        </Notice>
      )}
      {error === undefined ? null : (
        <p className="m-field__error" role="alert">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <p className="am02-empty">
          紹介先はまだありません。掲載・店舗・地域・イベントを探して結びつけます。
        </p>
      ) : (
        <ol className="am02-refs">
          {items.map((item, index) => {
            const name = showcaseNameText(item);
            return (
              <li
                key={showcaseKey(item)}
                className="am02-ref"
                {...(item.viewable ? {} : { "data-unviewable": "" })}
              >
                <span className="am02-ref__text">
                  <span className="am02-ref__kind">
                    {`${index + 1} · ${SHOWCASE_KIND_LABEL[item.kind]}`}
                  </span>
                  <span className="am02-ref__name">{name}</span>
                  <StateLine item={item} />
                </span>
                <span className="am02-ref__ops">
                  {item.viewable ? <DetailChip item={item} /> : null}
                  <ChipButton
                    disabled={disabled || index === 0}
                    aria-label={`${name}を前へ`}
                    onClick={() => move(index)}
                  >
                    前へ
                  </ChipButton>
                  <ChipButton
                    disabled={disabled}
                    aria-label={`${name}を外す`}
                    onClick={() =>
                      onChange(items.filter((_, i) => i !== index))
                    }
                  >
                    外す
                  </ChipButton>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <Button
        variant="secondary"
        className="am02-add"
        disabled={disabled}
        onClick={() => setPicking(true)}
      >
        紹介先を追加
      </Button>
      <ShowcasePicker
        open={picking}
        linked={linked}
        onClose={() => setPicking(false)}
        onPick={(item) => {
          if (!linked.has(showcaseKey(item))) onChange([...items, item]);
          setPicking(false);
        }}
      />
    </section>
  );
}
