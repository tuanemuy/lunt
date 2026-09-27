import { createFileRoute } from "@tanstack/react-router";
import { AccountSkeleton } from "@/components/account/AccountSkeleton";
import {
  ManageBackLink,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { Deferred } from "@/components/ui/Deferred";
import { requireLogin } from "@/presentation/session";
import { renderWithdrawal } from "./-render";

/** MY-07 退会. Needs a login (CS-04). */
export const Route = createFileRoute("/_account/me/withdraw")({
  beforeLoad: ({ location }) => requireLogin(location),
  loader: async () => {
    const { Withdrawal } = await renderWithdrawal();
    return { Withdrawal };
  },
  head: () => ({ meta: [{ title: "退会 — Lunt" }] }),
  component: WithdrawPage,
});

function WithdrawPage() {
  const { Withdrawal } = Route.useLoaderData();
  return (
    <Deferred
      promise={Withdrawal}
      fallback={
        <ManagePage
          title={
            <ManageTitle>
              <ManageBackLink to="/me">マイページ</ManageBackLink>
              <ManageHeading>退会</ManageHeading>
            </ManageTitle>
          }
        >
          <AccountSkeleton label="退会で起きることを読み込んでいます" />
        </ManagePage>
      }
    />
  );
}
