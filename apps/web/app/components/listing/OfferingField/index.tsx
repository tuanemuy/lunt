"use client";

import { type KeyboardEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/ChipButton";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Field, Input } from "@/components/ui/Field";
import type { OfferingDraft } from "@/presentation/listingForm";
import { jpDateWithWeekday } from "@/presentation/listingView";

type OfferingFieldProps = {
  value: OfferingDraft;
  onChange: (value: OfferingDraft) => void;
  error?: string;
  disabled?: boolean;
};

const KIND_CHOICES = [
  { value: "none", label: "設定しない" },
  { value: "period", label: "提供期間" },
  { value: "dates", label: "開催日" },
] as const;

/**
 * Enter in a date field would submit the listing form (saving it); it does
 * nothing there, as in the rest of the offering.
 */
const keepFormUnsent = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === "Enter") event.preventDefault();
};

/**
 * CF-06 提供の設定: none, a period (start, end or both) or open dates —
 * one at a time; switching drops the previous setting. No times, seats
 * or bookings.
 */
export function OfferingField({
  value,
  onChange,
  error,
  disabled = false,
}: OfferingFieldProps) {
  const [adding, setAdding] = useState("");
  const canAdd =
    !disabled &&
    adding !== "" &&
    value.kind === "dates" &&
    !value.dates.includes(adding);
  const addDate = () => {
    if (!canAdd || value.kind !== "dates") return;
    onChange({ ...value, dates: [...value.dates, adding].sort() });
    setAdding("");
  };
  const pickKind = (kind: OfferingDraft["kind"]) => {
    if (kind === value.kind) return;
    onChange(
      kind === "period"
        ? { kind, start: "", end: "" }
        : kind === "dates"
          ? { kind, dates: [] }
          : { kind: "none" },
    );
  };
  return (
    <div className="m-section" id="offering">
      <ChoiceGroup
        legend="提供の設定"
        name="offering"
        requirement="optional"
        choices={KIND_CHOICES.map((choice) => ({ ...choice, disabled }))}
        value={value.kind}
        onChange={pickKind}
        help="切り替えると、前の設定は残りません。"
        {...(error === undefined ? {} : { error })}
      />
      {value.kind === "period" ? (
        <>
          <div className="sm04-period">
            <Field id="offering-start" label="開始日">
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={value.start}
                  disabled={disabled}
                  onKeyDown={keepFormUnsent}
                  onChange={(event) =>
                    onChange({ ...value, start: event.currentTarget.value })
                  }
                />
              )}
            </Field>
            <Field id="offering-end" label="終了日">
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={value.end}
                  disabled={disabled}
                  onKeyDown={keepFormUnsent}
                  onChange={(event) =>
                    onChange({ ...value, end: event.currentTarget.value })
                  }
                />
              )}
            </Field>
          </div>
          <p className="m-field__help">
            開始日だけ、終了日だけでも設定できます。
          </p>
        </>
      ) : null}
      {value.kind === "dates" ? (
        <div className="m-field">
          <p className="m-field__label">開催日</p>
          {value.dates.length === 0 ? (
            <p className="m-field__help">開催日はまだありません。</p>
          ) : (
            <ul className="sm04-dates">
              {value.dates.map((date) => (
                <li key={date}>
                  <span>{jpDateWithWeekday(date)}</span>
                  <ChipButton
                    aria-label={`${jpDateWithWeekday(date)}を外す`}
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...value,
                        dates: value.dates.filter((day) => day !== date),
                      })
                    }
                  >
                    外す
                  </ChipButton>
                </li>
              ))}
            </ul>
          )}
          <div className="m-inline">
            <Input
              type="date"
              aria-label="追加する開催日"
              value={adding}
              disabled={disabled}
              onChange={(event) => setAdding(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addDate();
              }}
            />
            <Button variant="secondary" disabled={!canAdd} onClick={addDate}>
              追加
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
