import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DevSignInForm } from "@/components/dev/DevSignInForm";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Notice } from "@/components/ui/Notice";
import { loadDevToolsEnabled } from "@/presentation/devTools";

const searchSchema = z.object({
  next: z.string().max(2048).optional().catch(undefined),
});

/**
 * MY-02 ログイン. Screens that need a login (CS-04) send the visitor here
 * with the path to return to in `next`. The mail and external-account
 * logins arrive with Account (S1-ACC); until then, development builds
 * offer the development login.
 */
export const Route = createFileRoute("/_account/login")({
  validateSearch: searchSchema,
  loader: async () => ({ devTools: await loadDevToolsEnabled() }),
  head: () => ({ meta: [{ title: "ログイン — Lunt" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { next } = Route.useSearch();
  const { devTools } = Route.useLoaderData();
  return (
    <ManagePage
      title={
        <ManageTitle>
          <ManageHeading>ログイン</ManageHeading>
        </ManageTitle>
      }
    >
      <ManageBody>
        {devTools ? (
          <>
            <Notice variant="manage" title="開発用のログイン">
              開発環境だけで使えます。メールと外部アカウントでのログインは、アカウントの機能とともに加わります。
            </Notice>
            <DevSignInForm next={next} />
          </>
        ) : (
          <EmptyPanel title="ログインは準備中です">
            ログインの機能は、アカウントの機能とともに使えるようになります。
          </EmptyPanel>
        )}
      </ManageBody>
    </ManagePage>
  );
}
