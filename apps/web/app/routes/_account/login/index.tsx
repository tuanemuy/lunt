import { createFileRoute } from "@tanstack/react-router";
import { LoginFlow } from "@/components/account/LoginFlow";
import { loadLoginPageFn, loginSearchSchema } from "@/presentation/login";

/**
 * MY-02 ログイン. Screens that need a login (CS-04) send the visitor here
 * with the path to return to in `next`; a failed external login comes
 * back with `external`.
 */
export const Route = createFileRoute("/_account/login/")({
  validateSearch: loginSearchSchema,
  loader: () => loadLoginPageFn(),
  head: () => ({ meta: [{ title: "ログイン — Lunt" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { next, external } = Route.useSearch();
  const { devTools, currentEmail, providers } = Route.useLoaderData();
  return (
    <LoginFlow
      next={next}
      external={external}
      currentEmail={currentEmail}
      providers={providers}
      devTools={devTools}
    />
  );
}
