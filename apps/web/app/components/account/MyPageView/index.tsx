"use client";

import { DevSignOutButton } from "@/components/dev/DevSignOutButton";
import { ManageBody, ManageSection } from "@/components/layout/ManageShell";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRow, ListRowLink } from "@/components/ui/Rows";
import { TextLink } from "@/components/ui/TextButton";
import {
  type MyPageData,
  type MyPageEntry,
  myPageSections,
  SHOP_ENTRY,
} from "@/presentation/myPage";

function EntryRow({ entry }: { entry: MyPageEntry }) {
  const meta = entry.meta === undefined ? {} : { meta: entry.meta };
  return (
    <li>
      {entry.to === null ? (
        <ListRow title={entry.title} {...meta} />
      ) : (
        <ListRowLink to={entry.to} title={entry.title} {...meta} />
      )}
    </li>
  );
}

/** The design's notice-shaped entry (`my01-shop`); a link once RQ-01 exists. */
function ShopEntry({ entry }: { entry: MyPageEntry }) {
  return (
    <Notice
      variant="manage"
      title={entry.title}
      {...(entry.to === null
        ? {}
        : { actions: <TextLink to={entry.to}>{entry.title}</TextLink> })}
    >
      {entry.meta}
    </Notice>
  );
}

function DevTools() {
  return (
    <ManageSection id="my-dev" title="開発用">
      <div className="my-links">
        <TextLink to="/__dev/inbox">開発用の受信箱</TextLink>
      </div>
      <DevSignOutButton />
    </ManageSection>
  );
}

/** MY-01 マイページ's body in its two states (未ログイン / ログイン中). */
export function MyPageView({ data }: { data: MyPageData }) {
  if (data.kind === "guest") {
    return (
      <ManageBody>
        <EmptyPanel
          title="ログインしていません"
          actions={<ButtonLink to="/login">ログイン</ButtonLink>}
        >
          ログインすると、通知や申請の状況を確かめられます。この端末で保存した掲載と店舗は、ログインしたアカウントに引き継がれます。パスワードは要りません。
        </EmptyPanel>
        <ShopEntry entry={SHOP_ENTRY} />
        {data.devTools ? <DevTools /> : null}
      </ManageBody>
    );
  }
  const sections = myPageSections(data.roles, data.stewarded);
  return (
    <ManageBody>
      <div className="my01-account">
        <p className="my01-account__label">ログイン中のアカウント</p>
        <p className="my01-account__mail">{data.email}</p>
      </div>
      {sections.length === 0 ? null : (
        <div className="my01-grid">
          {sections.map((section) => (
            <ManageSection
              key={section.id}
              id={section.id}
              title={section.title}
            >
              <LinkList>
                {section.entries.map((entry) => (
                  <EntryRow key={entry.key} entry={entry} />
                ))}
              </LinkList>
            </ManageSection>
          ))}
        </div>
      )}
      <ShopEntry entry={SHOP_ENTRY} />
      <ManageSection id="my-account" title="アカウント">
        <LinkList>
          <li>
            <ListRowLink
              to="/me/withdraw"
              title="退会"
              meta="アカウントと保存、管理権限・役割がなくなります"
            />
          </li>
        </LinkList>
      </ManageSection>
      {data.devTools ? <DevTools /> : null}
    </ManageBody>
  );
}
