import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { OpsNav } from "@/components/ops/OpsShell";
import { RoleHoldersSkeleton } from "@/components/ops/RoleHoldersSkeleton";
import { Deferred } from "@/components/ui/Deferred";
import { renderRoleHolders } from "./-render";

const searchSchema = z.object({
  /** Opened from MY-07 by the only operator, to hand the role over first. */
  from: z.literal("withdraw").optional().catch(undefined),
  /** Set once the viewer revoked their own operator role (CS-05 wording). */
  revoked: z.literal("self").optional().catch(undefined),
});

/** OM-07 役割の管理: editors and operators, appointed / granted and revoked. */
export const Route = createFileRoute("/_manage/ops/roles")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ from: search.from }),
  loader: async ({ deps }) => {
    const { RoleHolders } = await renderRoleHolders({
      data: { fromWithdrawal: deps.from === "withdraw" },
    });
    return { RoleHolders };
  },
  head: () => ({ meta: [{ title: "役割の管理 — Lunt" }] }),
  component: RolesPage,
});

function RolesPage() {
  const { RoleHolders } = Route.useLoaderData();
  return (
    <ManagePage
      title={
        <ManageTitle>
          <ManageHeading>役割の管理</ManageHeading>
        </ManageTitle>
      }
      nav={<OpsNav />}
    >
      <Deferred promise={RoleHolders} fallback={<RoleHoldersSkeleton />} />
    </ManagePage>
  );
}
