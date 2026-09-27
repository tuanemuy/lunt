import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LinkLogin } from "@/components/account/LinkLogin";

const searchSchema = z.object({
  token: z.string().min(1).max(512).optional().catch(undefined),
});

/**
 * MY-02: where the login mail's link lands. The GET only renders; the
 * page redeems the token once it runs in the browser.
 */
export const Route = createFileRoute("/_account/login/link")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "ログイン — Lunt" },
      { name: "referrer", content: "no-referrer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LinkLoginPage,
});

function LinkLoginPage() {
  const { token } = Route.useSearch();
  return <LinkLogin token={token} />;
}
