"use client";

import { RemovableChip } from "@/components/ui/Chip";
import { TextButton } from "@/components/ui/TextButton";
import type { ConditionItem } from "@/presentation/exploreView";

type ConditionChipsProps = {
  items: readonly ConditionItem[];
  /** Removes one condition (CF-03 の1つずつの解除). */
  onRemove: (item: ConditionItem) => void;
  /** Removes every condition (すべて解除). */
  onClear: () => void;
  /** A change is being applied: the chips stay but do not take another. */
  pending?: boolean;
};

/**
 * CF-03 選択中の条件の表示: the chosen areas and categories as removable
 * chips, and すべて解除. Shared by VW-01, VW-04 and VW-05; nothing is
 * rendered without a condition. The items come from `loadConditionItems`
 * (`presentation/exploreData.ts`); the screen turns a removal into its URL
 * with `withoutArea` / `withoutCategory` (`presentation/browseSearch.ts`).
 */
export function ConditionChips({
  items,
  onRemove,
  onClear,
  pending = false,
}: ConditionChipsProps) {
  if (items.length === 0) return null;
  return (
    <fieldset
      className="conditions"
      aria-label="選択中の条件"
      aria-busy={pending}
      disabled={pending}
    >
      <ul className="conditions__list">
        {items.map((item) => (
          <li
            key={item.kind === "area" ? `area:${item.code}` : `cat:${item.id}`}
          >
            <RemovableChip
              removeLabel={`条件「${item.label}」を解除`}
              onClick={() => onRemove(item)}
            >
              {item.label}
            </RemovableChip>
          </li>
        ))}
      </ul>
      <TextButton onClick={onClear}>すべて解除</TextButton>
    </fieldset>
  );
}
