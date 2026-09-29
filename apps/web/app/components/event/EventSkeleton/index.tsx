import { ManageBody } from "@/components/layout/ManageShell";
import { Skeleton } from "@/components/ui/Skeleton";

type EventSkeletonProps = {
  /** The shape of the screen being read. */
  variant: "list" | "form" | "participation";
  /** The single status announcement, e.g. 参加店舗と申請を読み込んでいます. */
  label: string;
};

const bar = "h-25 w-full";
const heading = "h-27 w-2/5";
const field = "h-48 w-full rounded-8";
const row = "h-88 w-full";

/** CS-01 of the EM screens and CM-04, shaped like each body. */
export function EventSkeleton({ variant, label }: EventSkeletonProps) {
  const blocks = (() => {
    switch (variant) {
      case "list":
        return [bar, heading, field, field, heading, row, row];
      case "form":
        return [heading, bar, heading, bar, "h-150 w-full", heading, field];
      case "participation":
        return [heading, row, heading, row, row, heading, field];
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
