"use client";

import { useEffect, useState } from "react";
import { TextLink } from "@/components/ui/TextButton";
import { OpsSearchReturnLink } from "../OpsSearchReturn";

const KEY = "lunt:proxy-from-report";

type ReportReturn = Readonly<{ placeId: string; reportId: string }>;

/**
 * Remembers, for this tab, that OM-05 opened the absence proxy or CM-02
 * of `placeId` while handling `reportId`, so those screens lead back to
 * OM-05 instead of OM-02 / OM-03.
 */
export function rememberReportProxy(placeId: string, reportId: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ placeId, reportId }));
  } catch {
    // Storage refused: the way back falls back to OM-02.
  }
}

/** A screen opened from OM-02 or OM-03 no longer leads back to a report. */
export function forgetReportProxy(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored or storage refused.
  }
}

function readReportReturn(): ReportReturn | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "placeId" in parsed &&
      "reportId" in parsed &&
      typeof parsed.placeId === "string" &&
      typeof parsed.reportId === "string"
    ) {
      return { placeId: parsed.placeId, reportId: parsed.reportId };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The report whose OM-05 opened a screen of `placeId` (the absence proxy,
 * CM-02), or `null`. Read after hydration (the server has no tab storage).
 */
export function useReportReturn(placeId: string | null): string | null {
  const [report, setReport] = useState<ReportReturn | null>(null);
  useEffect(() => setReport(readReportReturn()), []);
  return report !== null && report.placeId === placeId ? report.reportId : null;
}

/** 連絡の対応へ戻る, to OM-05 of `reportId`. */
export function ReportReturnLink({
  reportId,
  className,
}: {
  reportId: string;
  className?: string;
}) {
  return (
    <TextLink
      to="/ops/reports/$reportId"
      params={{ reportId }}
      {...(className === undefined ? {} : { className })}
    >
      連絡の対応へ戻る
    </TextLink>
  );
}

/**
 * The absence proxy's way back (CS-14): to the report being handled when
 * OM-05 opened this store's proxy, otherwise to OM-02's last search.
 */
export function ProxyReturnLink({ placeId }: { placeId: string }) {
  const reportId = useReportReturn(placeId);
  return reportId === null ? (
    <OpsSearchReturnLink />
  ) : (
    <ReportReturnLink reportId={reportId} />
  );
}
