import { createFileRoute } from "@tanstack/react-router";
import { FakeIdpScreen } from "@/components/dev/FakeIdpScreen";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageShell,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { requireDevTools } from "@/presentation/devTools";
import { checkFakeIdpRequestFn } from "@/presentation/fakeIdp";

/**
 * Development tool: the fake provider's authorization screen, where the
 * "Google" login of a development build lands. The raw query is checked
 * on the server against the OIDC request the fake provider accepts.
 */
export const Route = createFileRoute("/__dev/idp/authorize")({
  beforeLoad: () => requireDevTools(),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ location }) => {
    const query = location.searchStr;
    return { query, view: await checkFakeIdpRequestFn({ data: { query } }) };
  },
  head: () => ({ meta: [{ title: "Fake IdP — Lunt" }] }),
  component: FakeIdpPage,
});

function FakeIdpPage() {
  const { query, view } = Route.useLoaderData();
  return (
    <ManageShell context="開発用" homeTo="/" accountLink={false}>
      <ManagePage
        title={
          <ManageTitle>
            <ManageHeading>外部アカウントでのログイン</ManageHeading>
          </ManageTitle>
        }
      >
        <ManageBody>
          <FakeIdpScreen query={query} view={view} />
        </ManageBody>
      </ManagePage>
    </ManageShell>
  );
}
