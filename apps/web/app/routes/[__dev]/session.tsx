import { createFileRoute } from "@tanstack/react-router";
import { DevSignOutButton } from "@/components/dev/DevSignOutButton";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageShell,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { FactList } from "@/components/ui/FactList";
import { devWhoAmIFn } from "@/presentation/devSession";
import { requireDevTools } from "@/presentation/devTools";
import { requireLogin } from "@/presentation/session";

/**
 * Development tool: a screen that needs a login. Shows who the session
 * belongs to, and exercises the CS-04 guard — open it logged out and it
 * sends you to MY-02, then back here.
 */
export const Route = createFileRoute("/__dev/session")({
  beforeLoad: async ({ location }) => {
    await requireDevTools();
    await requireLogin(location);
  },
  loader: () => devWhoAmIFn(),
  head: () => ({ meta: [{ title: "Session — Lunt" }] }),
  component: SessionPage,
});

function SessionPage() {
  const account = Route.useLoaderData();
  return (
    <ManageShell context="開発用" homeTo="/">
      <ManagePage
        title={
          <ManageTitle>
            <ManageHeading>ログイン中のアカウント</ManageHeading>
          </ManageTitle>
        }
        actions={<DevSignOutButton />}
      >
        <ManageBody>
          <FactList
            facts={[
              { term: "アカウント ID", description: account.accountId },
              { term: "メールアドレス", description: account.email ?? "—" },
            ]}
          />
        </ManageBody>
      </ManagePage>
    </ManageShell>
  );
}
