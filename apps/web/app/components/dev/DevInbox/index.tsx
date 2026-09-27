"use client";

import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Field, Input } from "@/components/ui/Field";
import type { DevInboxView } from "@/presentation/devInbox";

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/**
 * The mail's text with its URLs as links. Only the text part is shown —
 * the HTML part is never injected into the page.
 */
function linkify(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    if (start > last) parts.push(text.slice(last, start));
    const href = match[0];
    parts.push(
      <a key={`${start}-${href}`} href={href}>
        {href}
      </a>,
    );
    last = start + href.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Tokyo",
});

/** Development tool: the development inbox, filtered by recipient. */
export function DevInbox({
  view,
  to,
}: {
  view: DevInboxView;
  to: string | undefined;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  if (view.kind === "disabled") {
    return (
      <EmptyPanel title="開発用の受信箱は使っていません">
        メールは SMTP
        で送られています（MAIL_TRANSPORT=smtp）。受信箱で確かめるには、MAIL_TRANSPORT=devInbox
        にしてください。
      </EmptyPanel>
    );
  }
  return (
    <>
      <form method="get" action="/__dev/inbox" className="m-form">
        <Field id="dev-inbox-to" label="宛先で絞り込む">
          {(control) => (
            <div className="m-inline">
              <Input
                {...control}
                name="to"
                type="email"
                placeholder="例: name@example.jp"
                defaultValue={to ?? ""}
              />
              <Button type="submit" variant="secondary">
                絞り込む
              </Button>
            </div>
          )}
        </Field>
      </form>
      <Button
        variant="secondary"
        disabled={refreshing}
        onClick={() =>
          startRefresh(async () => {
            await router.invalidate({ sync: true });
          })
        }
      >
        {refreshing ? "読み込んでいます…" : "新しいメールを読み込む"}
      </Button>
      {view.mails.length === 0 ? (
        <EmptyPanel title="メールはありません">
          {to === undefined
            ? "開発用の受信箱に、まだメールは届いていません。"
            : `${to} 宛てのメールはありません。`}
        </EmptyPanel>
      ) : (
        <ul className="flex flex-col gap-16">
          {view.mails.map((mail) => (
            <li key={mail.id} className="dev-mail">
              <p className="dev-mail__subject">{mail.subject}</p>
              <p className="dev-mail__meta">
                宛先 {mail.to} · 差出人 {mail.from} ·{" "}
                <time dateTime={mail.sentAt}>
                  {DATE_FORMAT.format(new Date(mail.sentAt))}
                </time>
              </p>
              <p className="dev-mail__text">{linkify(mail.text)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
