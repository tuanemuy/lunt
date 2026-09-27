import { ManageBody } from "@/components/layout/ManageShell";
import { Skeleton } from "@/components/ui/Skeleton";

type ShopSkeletonProps = {
  /** The shape of the screen being read. */
  variant: "home" | "form" | "list" | "preview";
  /** The single status announcement, e.g. 店舗の状況を読み込んでいます. */
  label: string;
};

const bar = "h-25 w-full";
const heading = "h-27 w-2/5";
const field = "h-48 w-full rounded-8";

/** CS-01 of the SM screens and CM-03, shaped like each body. */
export function ShopSkeleton({ variant, label }: ShopSkeletonProps) {
  const blocks = (() => {
    switch (variant) {
      case "home":
        return [bar, "h-150 w-full", field, field, heading, "h-88 w-full"];
      case "form":
        return [bar, "h-150 w-full", heading, field, heading, field, field];
      case "list":
        return [field, "h-88 w-full", "h-88 w-full", "h-88 w-full"];
      case "preview":
        return [bar, "aspect-[348/290] w-full", heading, bar, bar];
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
