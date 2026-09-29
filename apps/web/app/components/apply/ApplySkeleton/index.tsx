import { ManageBody } from "@/components/layout/ManageShell";
import { Skeleton } from "@/components/ui/Skeleton";

const bar = "h-25 w-full";
const field = "h-48 w-full rounded-8";

/**
 * CS-01 of the application screens (RQ-02〜RQ-06), shaped like the form:
 * the target row or photo, then labelled fields.
 */
export function ApplySkeleton({
  variant,
  label,
}: {
  /** `place`: a photo and the profile's fields; `claim`: the target row and two texts. */
  variant: "place" | "claim" | "listing" | "preview" | "event";
  label: string;
}) {
  const blocks = (() => {
    switch (variant) {
      case "place":
        return ["h-150 w-full", bar, field, bar, field, bar, field];
      case "claim":
        return ["h-88 w-full", bar, "h-88 w-full", bar, "h-88 w-full"];
      case "listing":
        return [
          bar,
          "h-88 w-full",
          bar,
          "h-150 w-full",
          bar,
          field,
          bar,
          field,
        ];
      case "preview":
        return [bar, "aspect-[348/290] w-full", "h-27 w-2/5", bar, bar];
      case "event":
        return ["h-150 w-full", bar, bar, "h-88 w-full"];
    }
  })();
  return (
    <ManageBody aria-busy="true">
      <div className="m-skeleton" aria-hidden="true">
        {blocks.map((className, index) => (
          <Skeleton
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of placeholder bars
            key={index}
            variant="manage"
            className={className}
          />
        ))}
      </div>
      <p className="sr-only" role="status">
        {label}
      </p>
    </ManageBody>
  );
}
