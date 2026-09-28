import { useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Row } from "@/components/ui/Rows";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ReportTargetRow } from "@/presentation/moderation";

/** The title band of RQ-07 / RQ-08. */
export function ReportTitle({ heading }: { heading: string }) {
  return (
    <ManageTitle>
      <ManageHeading>{heading}</ManageHeading>
    </ManageTitle>
  );
}

/** A target as a photo row (申立ての対象 / 連絡の対象). */
export function ReportTargetRowView({ row }: { row: ReportTargetRow }) {
  return (
    <Row
      photo={row.photoUrl === null ? null : { src: row.photoUrl, alt: "" }}
      name={row.name}
      meta={row.meta}
      {...(row.sub === null ? {} : { sub: row.sub })}
    />
  );
}

/** CS-06: the target is not viewable; nothing about it is shown. */
export function ReportUnavailable({
  heading,
  noun,
}: {
  heading: string;
  /** 申立て / 連絡 */
  noun: string;
}) {
  return (
    <ManagePage title={<ReportTitle heading={heading} />}>
      <ManageBody>
        <EmptyPanel
          title="この対象は閲覧できません"
          actions={<ButtonLink to="/">みつけるへ</ButtonLink>}
        >
          {`${noun}の対象が、閲覧できない状態になっています。${noun}は送られていません。`}
        </EmptyPanel>
      </ManageBody>
    </ManagePage>
  );
}

/** CS-01 of RQ-07 / RQ-08, shaped like the form. */
export function ReportSkeleton({
  heading,
  label,
  middle,
}: {
  heading: string;
  label: string;
  /** The second field's block: the chips of RQ-08, the field of RQ-07. */
  middle: "field" | "chip";
}) {
  return (
    <ManagePage title={<ReportTitle heading={heading} />}>
      <ManageBody aria-busy="true">
        <div className="m-skeleton" aria-hidden="true">
          <Skeleton variant="manage" className="h-25 w-2/5" />
          <Skeleton variant="manage" className="h-88 w-full" />
          <Skeleton variant="manage" className="h-25 w-2/5" />
          <Skeleton
            variant="manage"
            className={
              middle === "chip"
                ? "h-44 w-180 rounded-999"
                : "h-48 w-full rounded-8"
            }
          />
          <Skeleton variant="manage" className="h-25 w-2/5" />
          <Skeleton variant="manage" className="h-96 w-full rounded-8" />
        </div>
        <p className="sr-only" role="status">
          {label}
        </p>
      </ManageBody>
    </ManagePage>
  );
}

/** CS-02: the target could not be read; reloading tries again. */
export function ReportFailure({
  heading,
  title,
}: {
  heading: string;
  title: string;
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <ManagePage title={<ReportTitle heading={heading} />}>
      <ManageBody>
        <Alert
          title={title}
          actions={
            <Button
              variant="secondary"
              disabled={retrying}
              onClick={() =>
                startRetry(async () => {
                  await router.invalidate({ sync: true });
                })
              }
            >
              {retrying ? "読み込んでいます…" : "もう一度読み込む"}
            </Button>
          }
        >
          通信を確かめて、もう一度読み込んでください。
        </Alert>
      </ManageBody>
    </ManagePage>
  );
}
