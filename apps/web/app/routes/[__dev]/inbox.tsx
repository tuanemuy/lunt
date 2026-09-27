import { createFileRoute } from "@tanstack/react-router";
import { DevInbox } from "@/components/dev/DevInbox";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageShell,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { devInboxSearchSchema, listDevInboxFn } from "@/presentation/devInbox";
import { requireDevTools } from "@/presentation/devTools";

/**
 * Development tool: the development inbox (design.md D-07). Login mails
 * land here instead of being sent; their link and code work from here.
 */
export const Route = createFileRoute("/__dev/inbox")({
  validateSearch: devInboxSearchSchema,
  beforeLoad: () => requireDevTools(),
  loaderDeps: ({ search }) => ({ to: search.to }),
  loader: ({ deps }) =>
    listDevInboxFn({ data: deps.to === undefined ? {} : { to: deps.to } }),
  head: () => ({ meta: [{ title: "Inbox — Lunt" }] }),
  component: InboxPage,
});

function InboxPage() {
  const view = Route.useLoaderData();
  const { to } = Route.useSearch();
  return (
    <ManageShell context="開発用" homeTo="/">
      <ManagePage
        title={
          <ManageTitle>
            <ManageHeading>開発用の受信箱</ManageHeading>
          </ManageTitle>
        }
      >
        <ManageBody>
          <DevInbox view={view} to={to === "" ? undefined : to} />
        </ManageBody>
      </ManagePage>
    </ManageShell>
  );
}
