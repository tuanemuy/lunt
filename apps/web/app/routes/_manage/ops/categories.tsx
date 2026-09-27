import { createFileRoute } from "@tanstack/react-router";
import {
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { OpsNav } from "@/components/ops/OpsShell";
import { Deferred } from "@/components/ui/Deferred";
import { renderCategories } from "./-render";

/** OM-06 カテゴリーの管理. */
export const Route = createFileRoute("/_manage/ops/categories")({
  loader: async () => {
    const { Categories } = await renderCategories();
    return { Categories };
  },
  head: () => ({ meta: [{ title: "カテゴリーの管理 — Lunt" }] }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { Categories } = Route.useLoaderData();
  return (
    <ManagePage
      title={
        <ManageTitle>
          <ManageHeading>カテゴリーの管理</ManageHeading>
        </ManageTitle>
      }
      nav={<OpsNav />}
    >
      <Deferred
        promise={Categories}
        fallback={
          <ShopSkeleton variant="list" label="カテゴリーを読み込んでいます" />
        }
      />
    </ManagePage>
  );
}
