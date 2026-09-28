"use client";

import { Field, Textarea } from "@/components/ui/Field";
import {
  CLAIM_FIELD_ANCHOR,
  type ClaimFieldErrors,
} from "@/presentation/applyForm";
import type { ClaimValues } from "@/presentation/applyView";

const optionalError = (message: string | undefined) =>
  message === undefined ? {} : { error: message };

/**
 * A stewardship claim's two texts (RQ-03, and the claim filed with a
 * registration on RQ-02): the relationship to the place, and a contact or
 * material the operator can check it with. No files.
 */
export function ClaimFields({
  values,
  onChange,
  errors,
  disabled,
}: {
  values: ClaimValues;
  onChange: (change: Partial<ClaimValues>) => void;
  errors: ClaimFieldErrors;
  disabled: boolean;
}) {
  return (
    <>
      <Field
        id={CLAIM_FIELD_ANCHOR.relationship}
        label="店舗との関係"
        requirement="required"
        help="オーナー、店長、スタッフなど、お店とどう関わっているかを書きます。"
        {...optionalError(errors.relationship)}
      >
        {(control) => (
          <Textarea
            {...control}
            name="relationship"
            value={values.relationship}
            disabled={disabled}
            onChange={(event) =>
              onChange({ relationship: event.currentTarget.value })
            }
          />
        )}
      </Field>
      <Field
        id={CLAIM_FIELD_ANCHOR.evidence}
        label="確認に使える連絡先・資料"
        requirement="required"
        help="運営が確かめるために使います。ファイルは添えられないため、連絡先か、見せられる資料を文章で書きます。"
        {...optionalError(errors.evidence)}
      >
        {(control) => (
          <Textarea
            {...control}
            name="evidence"
            value={values.evidence}
            disabled={disabled}
            onChange={(event) =>
              onChange({ evidence: event.currentTarget.value })
            }
          />
        )}
      </Field>
    </>
  );
}
