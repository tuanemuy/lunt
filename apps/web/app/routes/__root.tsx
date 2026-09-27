import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import { type ReactNode, useEffect } from "react";
import { RootErrorPage } from "@/components/feedback/RouteErrorView";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { buildHead } from "@/presentation/head";
import appCss from "../styles/index.css?url";

export const loadAppContext = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getContainer } = await import(
      "@repo/core/application/di/containerStore"
    );
    const container = await getContainer();
    return { config: container.config };
  });

type AppContext = Awaited<ReturnType<typeof loadAppContext>>;

// The site settings never change while a page is open, so the browser keeps
// the first answer: a navigation made while offline then reaches its own
// route (and that route's CS-02) instead of failing here, above every shell.
let browserAppContext: AppContext | undefined;

async function appContext(): Promise<AppContext> {
  if (browserAppContext !== undefined) return browserAppContext;
  const loaded = await loadAppContext();
  if (typeof window !== "undefined") browserAppContext = loaded;
  return loaded;
}

/** Keeps the context the server rendered, for the first client navigation. */
function RememberAppContext() {
  const config = Route.useRouteContext({ select: (context) => context.config });
  useEffect(() => {
    // Absent when the server's own load of it failed (the root error page).
    if (config !== undefined) browserAppContext ??= { config };
  }, [config]);
  return null;
}

const SITE_ASSET_LINKS = [
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/site.webmanifest" },
];

export const Route = createRootRoute({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  beforeLoad: () => appContext(),
  head: ({ match }) => {
    const stylesheet = { rel: "stylesheet", href: appCss };
    const baseLinks = [...SITE_ASSET_LINKS, stylesheet];
    const config = match.context?.config;
    if (!config) return { links: baseLinks };
    const { meta, links } = buildHead(config);
    return { meta, links: [...baseLinks, ...links] };
  },
  // The document is the shell: the route's content, its error and its
  // not-found state all render inside it, so none of them nests <html>.
  shellComponent: RootDocument,
  component: Outlet,
  errorComponent: ({ error }) => (
    <RootErrorPage problem={{ kind: "error", error }} />
  ),
  notFoundComponent: () => <RootErrorPage problem={{ kind: "notFound" }} />,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <RememberAppContext />
        {import.meta.env.DEV ? <TanStackRouterDevtools /> : null}
        <Scripts />
      </body>
    </html>
  );
}
