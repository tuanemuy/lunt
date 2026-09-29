"use client";

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ManageBody, ManageStatus } from "@/components/layout/ManageShell";
import { Badge } from "@/components/ui/Badge";
import { CountTab, CountTabs } from "@/components/ui/CountTabs";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type {
  InboxKind,
  InboxSection,
  OpsInboxData,
} from "@/presentation/moderation";
import { type ReviewSearch, reviewFrom } from "@/presentation/reviewOrigin";

/** CM-01 of an application, a plain path (another area). */
const applicationReviewPath = (applicationId: string): string =>
  `/manage/applications/${encodeURIComponent(applicationId)}`;

type Row = Readonly<{
  key: string;
  to: string;
  /** CM-01's `?from=`, so its missing-application state leads back here. */
  search?: ReviewSearch;
  title: string;
  sub: string;
  who: string;
  status: string;
}>;

const SECTIONS = {
  app: { id: "om01-app", tab: "確認を待つ申請" },
  overdue: { id: "om01-overdue", tab: "期間超過" },
  claim: { id: "om01-claim", tab: "申立て" },
  report: { id: "om01-report", tab: "連絡" },
} as const satisfies Readonly<Record<InboxKind, { id: string; tab: string }>>;

function Section({
  kind,
  title,
  help,
  section,
  head,
  whoLabel,
  empty,
  rows,
}: {
  kind: InboxKind;
  title: string;
  help?: ReactNode;
  section: InboxSection<unknown>;
  head: string;
  whoLabel: string;
  empty: string;
  rows: readonly Row[];
}) {
  const { id } = SECTIONS[kind];
  return (
    <section className="m-section" aria-labelledby={id}>
      <div className="om-count">
        <SectionTitle variant="manage" id={id}>
          {title}
        </SectionTitle>
        <Badge tone={section.count === 0 ? "muted" : "count"}>
          {`${section.count}件`}
        </Badge>
      </div>
      {help === undefined ? null : <p className="m-field__help">{help}</p>}
      {rows.length === 0 ? (
        <Notice variant="manage" tone="paper" title={empty} />
      ) : (
        <table className="om-table">
          <thead>
            <tr>
              <th scope="col">{head}</th>
              <th scope="col">{whoLabel}</th>
              <th scope="col">状態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="om-table__name">
                  <Link
                    to={row.to}
                    {...(row.search === undefined
                      ? {}
                      : { search: row.search })}
                    className="om-table__title"
                  >
                    {row.title}
                  </Link>
                  <span className="om-table__sub">{row.sub}</span>
                </th>
                <td data-label={whoLabel}>
                  <span>{row.who}</span>
                </td>
                <td data-label="状態">
                  <span>{row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {section.count > rows.length ? (
        <p className="m-field__help">
          {`ほかに${section.count - rows.length}件あります。古いものから対応すると、ここに並びます。`}
        </p>
      ) : null}
    </section>
  );
}

/**
 * OM-01 対応が必要なもの (OPE-01, APP-08): the applications the operators
 * decide, those they may decide as the overdue proxy, the open takedown
 * claims and the unresolved info reports, oldest first, each with its
 * count. Read-only: every row opens the screen that handles it.
 */
export function OpsInboxView({ data }: { data: OpsInboxData }) {
  const total =
    data.asApprover.count +
    data.asOverdueProxy.count +
    data.claims.count +
    data.reports.count;
  const counts: Readonly<Record<InboxKind, number>> = {
    app: data.asApprover.count,
    overdue: data.asOverdueProxy.count,
    claim: data.claims.count,
    report: data.reports.count,
  };
  const applicationRows = (section: OpsInboxData["asApprover"]) =>
    section.items.map(
      (item): Row => ({
        key: item.applicationId,
        to: applicationReviewPath(item.applicationId),
        search: { from: reviewFrom({ kind: "ops" }) },
        title: item.title,
        sub: item.sub,
        who: item.applicant,
        status: item.status,
      }),
    );
  return (
    <ManageBody>
      {total === 0 ? (
        <>
          <ManageStatus tone="neutral">対応を待つものはありません</ManageStatus>
          <div role="status">
            <Notice
              variant="manage"
              tone="paper"
              title="対応が必要なものはありません"
            >
              確認を待つ申請、期間超過の代行ができる申請、取り下げの申立て、情報の誤り・閉店の連絡は、どれも1件もありません。新しく届くと、ここに並び、通知でも知らせます。
            </Notice>
          </div>
        </>
      ) : (
        <ManageStatus>{`対応を待つもの ${total}件`}</ManageStatus>
      )}
      <CountTabs label="対応が必要なものの種類">
        {(Object.keys(SECTIONS) as InboxKind[]).map((kind) => (
          <CountTab
            key={kind}
            to="/ops"
            search={{ kind }}
            hash={SECTIONS[kind].id}
            count={counts[kind]}
            activeOptions={{ exact: true, includeSearch: true }}
            activeProps={{ "aria-current": "true" }}
          >
            {SECTIONS[kind].tab}
          </CountTab>
        ))}
      </CountTabs>

      <Section
        kind="app"
        title="確認を待つ申請"
        help="サービス運営者が承認者の申請です。運営者が不在の地域・イベントへの申請を含みます。"
        section={data.asApprover}
        head="対象と種類"
        whoLabel="申請者"
        empty="確認を待つ申請はありません"
        rows={applicationRows(data.asApprover)}
      />
      <hr className="m-divider" />
      <Section
        kind="overdue"
        title="期間超過の代行ができる申請"
        help="地域運営者・イベント運営者が一定の期間確認していない、所属・離脱・参加の申請です。代行では、承認するか否認します。"
        section={data.asOverdueProxy}
        head="対象と種類"
        whoLabel="申請者"
        empty="期間超過の代行ができる申請はありません"
        rows={applicationRows(data.asOverdueProxy)}
      />
      <hr className="m-divider" />
      <Section
        kind="claim"
        title="取り下げの申立て"
        section={data.claims}
        head="対象"
        whoLabel="申立人"
        empty="対応を終えていない申立てはありません"
        rows={data.claims.items.map((item) => ({
          key: item.claimId,
          to: `/ops/takedowns/${encodeURIComponent(item.claimId)}`,
          title: item.title,
          sub: item.sub,
          who: item.claimant,
          status: item.status,
        }))}
      />
      <hr className="m-divider" />
      <Section
        kind="report"
        title="情報の誤り・閉店の連絡"
        section={data.reports}
        head="対象と種類"
        whoLabel="連絡"
        empty="対応を終えていない連絡はありません"
        rows={data.reports.items.map((item) => ({
          key: item.reportId,
          to: `/ops/reports/${encodeURIComponent(item.reportId)}`,
          title: item.title,
          sub: item.sub,
          who: item.reporter,
          status: item.status,
        }))}
      />
    </ManageBody>
  );
}
