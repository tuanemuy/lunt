import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { ShopSkeleton } from "@/components/manage/ShopSkeleton";
import { OpsNav } from "@/components/ops/OpsShell";
import { Deferred } from "@/components/ui/Deferred";
import {
  OPS_SUBJECT_KINDS,
  type OpsSubjectKind,
} from "@/presentation/opsSubject";
import { renderOpsSubject } from "../../-render";

const isSubjectKind = (kind: string): kind is OpsSubjectKind =>
  (OPS_SUBJECT_KINDS as readonly string[]).includes(kind);

/** OM-03 対象の運営 (`/ops/subjects/{place|listing|region|occasion}/$id`). */
export const Route = createFileRoute("/_manage/ops/subjects/$kind/$id")({
  loader: async ({ params }) => {
    if (!isSubjectKind(params.kind)) throw notFound();
    const { Subject } = await renderOpsSubject({
      data: { kind: params.kind, id: params.id },
    });
    return { Subject };
  },
  head: () => ({ meta: [{ title: "対象の運営 — Lunt" }] }),
  component: OpsSubjectPage,
});

function OpsSubjectPage() {
  const { Subject } = Route.useLoaderData();
  return (
    <Deferred
      promise={Subject}
      fallback={
        <ManagePage
          title={
            <ManageTitle>
              <ManageHeading>対象の運営</ManageHeading>
            </ManageTitle>
          }
          nav={<OpsNav />}
        >
          <ShopSkeleton variant="home" label="対象を読み込んでいます" />
        </ManagePage>
      }
    />
  );
}
