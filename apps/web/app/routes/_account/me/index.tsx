import { createFileRoute } from "@tanstack/react-router";
import { AccountSkeleton } from "@/components/account/AccountSkeleton";
import {
  ManageBackLink,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { Deferred } from "@/components/ui/Deferred";
import { renderMyPage } from "./-render";

/**
 * MY-01 マイページ. Opens without a login: the guest state offers the
 * login, the logged-in state the entries for the authority held.
 */
export const Route = createFileRoute("/_account/me/")({
  loader: async () => {
    const { MyPage } = await renderMyPage();
    return { MyPage };
  },
  head: () => ({ meta: [{ title: "マイページ — Lunt" }] }),
  component: MyPage,
});

function MyPage() {
  const { MyPage: content } = Route.useLoaderData();
  return (
    <ManagePage
      title={
        <ManageTitle>
          <ManageBackLink to="/">戻る</ManageBackLink>
          <ManageHeading>マイページ</ManageHeading>
        </ManageTitle>
      }
    >
      <Deferred
        promise={content}
        fallback={<AccountSkeleton label="マイページを読み込んでいます" />}
      />
    </ManagePage>
  );
}
