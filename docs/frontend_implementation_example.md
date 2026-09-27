# Frontend Implementation Guide

Copy-and-adapt patterns for adding a screen to Lunt. The stage-1 screens are the reference: MY-02 ログイン, MY-01 マイページ, MY-03 通知一覧, MY-07 退会 and OM-07 役割の管理. Every excerpt below is trimmed from them (`// …` marks a cut), so open the file for the rest.

- Principles, the frontend rules (server component → `"use client"` island → React 19 primitives, `useReconcile`, `Deferred`, skeletons) and the error catch policy: `AGENTS.md`.
- The backend a screen calls (usecases, containers, errors): `docs/backend_implementation_example.md`.
- What to build: `spec/pages/` (screens, states, the common states CS-01…CS-17), `spec/design/` (tokens and one HTML design per screen); URLs: `.spec-implement/phases/P0.md` (付録: 画面と URL の対応).

## 1. File layout

```
apps/web/app/
├── router.tsx                         default pending / error / not-found views
├── start.ts                           CSRF middleware, AppServerError serialization
├── styles/                            tokens.css → theme.css (Tailwind bridge) → components / viewer / manage / pages
├── routes/
│   ├── __root.tsx                     document shell, app context (site config)
│   ├── _viewer.tsx, _viewer/…         viewer screens (VW, DT) in ViewerShell
│   ├── _account.tsx, _account/…       account screens (MY) in ManageShell「アカウント」
│   │   ├── login/index.tsx, login/link.tsx, login/external/$provider/{index,callback}.tsx
│   │   └── me/index.tsx, me/notifications.tsx, me/withdraw.tsx, me/-render.tsx
│   ├── _manage.tsx, _manage/…         management screens: login required (CS-04)
│   │   └── ops.tsx, ops/{index,roles}.tsx, ops/-render.tsx   OM area: operators only (CS-05)
│   └── [__dev]/…                      /__dev/* development tools (inbox, idp, session, ui, errors)
├── components/
│   ├── ui/                            design-system parts (Button, Field, Alert, Notice, EmptyPanel, Deferred, Skeleton, Icon, …)
│   ├── layout/                        ManageShell (+ ManagePage, ManageNav, …), ViewerShell
│   ├── feedback/RouteErrorView        the common states a route shows instead of its content
│   ├── account/                       MY screens: {Screen}Content (server) + {Screen}View/Panel/List (client)
│   ├── ops/                           OM screens: OpsShell, RoleHoldersContent (server), RoleBoard (client)
│   └── dev/                           development tools' components
└── presentation/                      framework glue: server functions, session / Actor, errors, validation
    ├── {feature}.ts                   client-safe: types, zod schemas, server functions (login.ts, roles.ts, …)
    ├── {feature}Data.ts               server-only loaders for server components (myPageData.ts, …)
    ├── errorCatalog/{d}.ts            how each business error code is shown (domain agents own these)
    └── __tests__/                     unit tests of the pure pieces
```

- A route file is a thin proxy: search validation, guards (`beforeLoad`), a loader that forwards data or an RSC payload, and the page frame. Anything with state or effects lives in `components/`.
- `-render.tsx` (the `-` prefix keeps it out of routing) holds the `createServerFn` that renders a route's server component; `apps/web/app/routes/_account/me/-render.tsx` is the example.
- `presentation/*.ts` imported by components must stay client-safe: server-only modules (`presentation/actor.ts`, `presentation/myPageData.ts`, `presentation/notificationListData.ts`, `presentation/externalLogin.ts`) are imported dynamically inside a handler or only from a server component, and say so in their first line.

### Layouts and shells

Pathless layouts decide the frame and the guard:

| Layout | Frame | Guard |
| --- | --- | --- |
| `apps/web/app/routes/_viewer.tsx` | `ViewerShell`; a leaf picks its header and tab with `staticData` | none |
| `apps/web/app/routes/_account.tsx` | `ManageShell context="アカウント"` | per screen (`requireLogin` in the leaf's `beforeLoad`: MY-03, MY-07) |
| `apps/web/app/routes/_manage.tsx` | none — each area's layout draws its own | `requireLogin` (CS-04) |
| `apps/web/app/routes/_manage/ops.tsx` | `OpsShell` (`ManageShell context="サービス運営"`) | `requireOperatorFn` (CS-05) |

An area layout gives its own `errorComponent` that draws the frame, because a layout whose guard failed has not rendered its shell:

```tsx
// apps/web/app/routes/_manage/ops.tsx
export const Route = createFileRoute("/_manage/ops")({
  beforeLoad: () => requireOperatorFn(),
  component: OpsLayout,
  errorComponent: OpsError,
});

function OpsError({ error }: ErrorComponentProps) {
  return (
    <OpsShell>
      {classifyError(error).kind === "forbidden" ? (
        <ManagePage title={null}>
          <ManageBody>
            <EmptyPanel
              title="サービス運営者ではありません"
              // …
      ) : (
        <RouteErrorContent problem={{ kind: "error", error }} />
      )}
    </OpsShell>
  );
}
```

A management page is `ManagePage` inside the area's shell: a title band (`ManageTitle`, `ManageHeading`, `ManageBackLink`), `ManageBody` blocks, the dock of `actions` (fixed to the bottom on mobile, after the body from `lg`) and the area's `nav` (`OpsNav` in `apps/web/app/components/ops/OpsShell/index.tsx`). A screen of a later stage keeps its planned URL: `/ops` redirects to OM-07 until OM-01 exists (`apps/web/app/routes/_manage/ops/index.tsx`).

## 2. Reading data: server component → `Deferred` → skeleton

A screen's content tied 1:1 to its URL streams: the loader calls a server function that returns `renderServerComponent(...)` **unresolved**, the route forwards it, and `Deferred` resolves it under a skeleton shaped like the content (CS-01). Navigation settles at once and `defaultPendingComponent` never shows.

```tsx
// apps/web/app/routes/_account/me/-render.tsx
export const renderMyPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { MyPageContent } = await import(
      "@/components/account/MyPageContent"
    );
    return { MyPage: renderServerComponent(<MyPageContent />) };
  });
```

```tsx
// apps/web/app/routes/_account/me/index.tsx
export const Route = createFileRoute("/_account/me/")({
  loader: async () => {
    const { MyPage } = await renderMyPage();
    return { MyPage };
  },
  // …
});

function MyPage() {
  const { MyPage: content } = Route.useLoaderData();
  return (
    <ManagePage title={/* … */}>
      <Deferred
        promise={content}
        fallback={<AccountSkeleton label="マイページを読み込んでいます" />}
      />
    </ManagePage>
  );
}
```

The server component only loads and hands plain data to a client component. It must not render anything built with `createLink` (`ButtonLink`, `ListRowLink`, `ManageBackLink`, …): `createLink` comes from a `"use client"` module, so in the server graph it is a client reference that cannot be called at module scope. Keep the markup in the client component.

```tsx
// apps/web/app/components/account/MyPageContent/index.tsx
export async function MyPageContent() {
  return <MyPageView data={await loadMyPage()} />;
}
```

```ts
// apps/web/app/presentation/myPageData.ts
// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
export async function loadMyPage(): Promise<MyPageData> {
  const container = await getContainer();
  const devTools = container.runtime.devTools;
  const actor = await resolveActor(container);
  if (actor === null) return { kind: "guest", devTools };
  const [account, authority] = await Promise.all([
    getMyAccount({ container, actor }),
    getMyAuthority({
      // …
```

Rules that keep it working:

- Pass only serializable view data to the client component (strings, ISO dates, plain unions). Map domain values in the loader: `RoleHoldersContent` maps `RoleHolderView` to `RoleHolderItem`, `loadNotificationPage` maps `NotificationView` to `NotificationItem` (`apps/web/app/presentation/notificationList.ts`).
- An error thrown *inside* the RSC render reaches the browser redacted (it can no longer be classified). Check login and authority in a `beforeLoad` or loader server function (`requireLogin`, `requireOperatorFn`), which throw `AppServerError`s the route's `errorComponent` can classify; the render then assumes access.
- Pagination and "load more" (CF-05) run from the client component through a server function that reuses the same loader: `NotificationList` calls `listNotificationsFn`, which calls `loadNotificationPage` (`apps/web/app/components/account/NotificationList/index.tsx`). Times that depend on "now" are worded against the server's clock sent with the page (`now` in `NotificationPage`), so the server and the browser render the same text.
- A screen that is interactive from the start and has no list to stream (MY-02) uses a plain loader returning data (`loadLoginPageFn` in `apps/web/app/presentation/login.ts`).
- Development-tool screens use plain loaders (`apps/web/app/routes/[__dev]/inbox.tsx`).

Skeletons live next to the screen and mirror its DOM: `apps/web/app/components/account/AccountSkeleton/index.tsx` (MY-01/MY-03/MY-07), `apps/web/app/components/ops/RoleHoldersSkeleton/index.tsx` (OM-07). Bars are `Skeleton variant="manage"`; the container carries one `role="status"` label.

## 3. Changing data: `"use client"` island + React 19 primitives

Every mutation goes: server function → await `useReconcile()` inside the same transition → the loader re-runs, `Deferred` adopts the fresh payload, and any optimistic state gives way to it in one commit. `useReconcile` is `router.invalidate({ sync: true })` (`apps/web/app/presentation/reconcile.ts`).

### List membership: the owner runs the change (OM-07)

Granting and revoking change who is in the list, so `RoleBoard` owns both lists in one `useOptimistic`, seeded by the server component's props. The revoke runs in the owner (an item-local delete would unmount its own error UI); the grant form lives outside the lists and dispatches into the owner's optimistic state.

```tsx
// apps/web/app/components/ops/RoleBoard/index.tsx
function applyAction(current: Holders, action: OptimisticAction): Holders {
  const list = current[action.role];
  switch (action.type) {
    case "add":
      // A reconcile may land the real row under a still-pending add.
      return list.some((holder) => holder.email === action.holder.email)
        ? current
        : { ...current, [action.role]: [...list, action.holder] };
    case "remove":
      // …
  }
}

export function RoleBoard({ holders, fromWithdrawal }: { /* … */ }) {
  const reconcile = useReconcile();
  const [optimistic, applyOptimistic] = useOptimistic<
    Holders,
    OptimisticAction
  >(holders, applyAction);
  const [revoking, startRevoke] = useTransition();
  // …
  const confirmRevocation = () => {
    // …
    startRevoke(async () => {
      applyOptimistic({ type: "remove", role, accountId: holder.accountId });
      try {
        await revokeRoleFn({ data: { role, accountId: holder.accountId } });
        // …
        setOutcome({ kind: "revoked", role, email: holder.email });
        await reconcile();
      } catch (error) {
        const classified = classifyError(error);
        if (classified.code === AuthorityErrorCode.RoleNotHeld) {
          setOutcome({ kind: "notHeld", role, email: holder.email });
          await reconcile();
        // …
      }
    });
  };
```

```tsx
// apps/web/app/components/ops/RoleBoard/GrantRoleForm.tsx
const [state, grant, granting] = useActionState(
  async (_previous: FormState, form: FormData): Promise<FormState> => {
    const typed = String(form.get("email") ?? "").trim();
    try {
      onOptimisticAdd(typed);
      await grantRoleFn({ data: { role, email: typed } });
      setEmail("");
      onGranted(typed);
      await reconcile();
      return { email: typed, error: null };
    } catch (error) {
      return { email: typed, error: classifyError(error) };
    }
  },
  { email: "", error: null },
);
```

- Irreversible or audience-reducing operations confirm first (CS-12) with `ConfirmDialog` (`apps/web/app/components/ui/ConfirmDialog/index.tsx`); the owner holds `open` and runs the operation on confirm.
- The outcome (CS-13 notice, CS-08 alert) is component state shown above the list; a notice goes in a `role="status"` wrapper.
- An outcome that removes the viewer's own access (revoking one's own operator role, the withdrawal) switches to a local state instead of reconciling — reloading would re-run the route's guard and reach CS-05 or MY-02 — and calls `router.clearCache()` so cached screens (MY-01) are read afresh on the next visit.
- Focus follows the state: a state that replaces the focused part of the screen takes the focus (`FocusOnMount`, `apps/web/app/components/ui/FocusOnMount/index.tsx`: MY-02's invalid-code panel, MY-07's completion), a rejected field takes it back so its `aria-describedby` message is read, and after an optimistic removal the list's section takes it instead of the removed row (`RoleBoard`).
- State copied from props survives a reconcile (the island is not remounted), so derive from props whatever the server can change: `WithdrawalPanel` computes "cannot withdraw" from `view.canWithdraw` on every render and keeps only the attempt's outcome in state (`apps/web/app/components/account/WithdrawalPanel/index.tsx`).

### In-item changes and single operations

Stage 1 has no in-item optimistic change; when one comes, the leaf owns its server function, its item-local `useOptimistic` and its error UI (`AGENTS.md`, Frontend). A single confirmed operation without a list uses `useTransition` and shows its result in place: MY-07's withdrawal (`WithdrawalPanel`) and the development sign-out (`apps/web/app/components/dev/DevSignOutButton/index.tsx`).

### Forms

Forms submit through `useActionState`; the action returns the typed values back so the inputs keep them after an error (CS-10, CS-02). Field-level messages come from `ErrorState.fieldErrors` (transport) or a business code (catalog); everything else is an `Alert` above the form. `Field` wires the label, help and error ids onto its control:

```tsx
// apps/web/app/components/ops/RoleBoard/GrantRoleForm.tsx
<Field
  id={inputId}
  label={words.grantLabel}
  help={words.grantHelp}
  {...(fieldError === undefined ? {} : { error: fieldError })}
>
  {(control) => (
    <div className="m-inline">
      <Input
        {...control}
        // …
```

## 4. Server functions

Server functions are declared inline with `createServerFn` so the TanStack Start compiler can turn them into RPC stubs, and always carry `errorResponseMiddleware` (the one redaction and status boundary). Client-posted payloads are validated at the transport boundary with `.validator(validateInput(schema))` — shape and DoS limits only; business rules stay in value objects. The handler imports its usecase and the container dynamically so the server graph stays out of the client bundle.

```ts
// apps/web/app/presentation/login.ts
export const startEmailLoginSchema = z.object({
  challengeId: challengeIdField,
  email: emailField,
});

export const startEmailLoginFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(startEmailLoginSchema))
  .handler(async ({ data }) => {
    const [{ getContainer }, { startEmailLogin }] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("@repo/core/application/account/startEmailLogin"),
    ]);
    const container = await getContainer();
    const challengeId = parseGeneratedId(
      container.idGenerator,
      "challengeId",
      data.challengeId,
    );
    await startEmailLogin({
      container,
      input: { challengeId, email: data.email },
    });
    return null;
  });
```

- `apps/web/app/presentation/serverAction.ts` has the shared plumbing: `loadServerDeps` (container + usecase module in parallel) and `serverData`, a schemaless loader for server components — internal-only, never fed external input.
- A caller-minted aggregate id (idempotent create, `AGENTS.md`) is parsed in the handler with `parseGeneratedId` into the `GeneratedId` the usecase requires. The client mints it once per attempt with `newId()` and resends it until the outcome is final:

```tsx
// apps/web/app/components/account/LoginFlow/index.tsx
// The send whose outcome is not known to be final. A failed send may have
// gone out with only its answer lost, so sending the same address again
// reuses the id and `startEmailLogin` answers it as a replay.
const attempt = useRef<{ id: string; email: string } | null>(null);
const [state, send, sending] = useActionState(
  async (_previous: SendState, form: FormData): Promise<SendState> => {
    const email = String(form.get("email") ?? "");
    const key = email.trim();
    if (attempt.current?.email !== key) {
      attempt.current = { id: newId(), email: key };
    }
    const { id } = attempt.current;
    try {
      await startEmailLoginFn({ data: { challengeId: id, email } });
      attempt.current = null;
      // …
```

- Usecases that need the logged-in account take the `Actor` from `requireActor(container)` inside the handler (`grantRoleFn`, `revokeRoleFn` in `apps/web/app/presentation/roles.ts`).
- Server route handlers (`server.handlers.GET`) serve the non-page endpoints: the external login's start and callback (`apps/web/app/routes/_account/login/external/$provider/index.tsx`, `apps/web/app/routes/_account/login/external/$provider/callback.tsx`) build a `Response` and set cookies with `setCookie`; the logic lives in `apps/web/app/presentation/externalLogin.ts`.
- CSRF: server functions are the only state-changing entry points, and `createCsrfMiddleware` in `apps/web/app/start.ts` refuses cross-site calls to them; the session cookie is `SameSite=Lax` on top.

## 5. URL parameters: `validateSearch`

URL parameters are validated in the route with a zod schema whose fields `.catch` to a safe value, so a hand-edited URL never errors the route. Loaders read validated values through `loaderDeps`.

```ts
// apps/web/app/presentation/login.ts
export const loginSearchSchema = z.object({
  next: z.string().max(2048).optional().catch(undefined),
  external: z.enum(EXTERNAL_LOGIN_FAILURES).optional().catch(undefined),
});
```

```ts
// apps/web/app/routes/_manage/ops/roles.tsx
export const Route = createFileRoute("/_manage/ops/roles")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ from: search.from }),
  loader: async ({ deps }) => {
    const { RoleHolders } = await renderRoleHolders({
      data: { fromWithdrawal: deps.from === "withdraw" },
    });
    return { RoleHolders };
  },
  // …
```

A value that later becomes a redirect target is checked again where it is used: `safeNextPath` accepts only a same-origin path and falls back to MY-01 (`apps/web/app/presentation/nextPath.ts`).

## 6. Session and the `Actor`

The session cookie holds a signed claim of the account (`apps/web/app/presentation/sessionToken.ts`); `apps/web/app/presentation/actor.ts` is the `Actor` boundary:

| Function | Use |
| --- | --- |
| `resolveActor(container)` | the logged-in `Actor` or `null`; checks the account still exists (a withdrawn account's session is dead) |
| `requireActor(container)` | the same, or `UnauthorizedError` (CS-04) — in handlers of usecases that need a login |
| `startSession(container, accountId)` | after a successful login (code, link, external, development sign-in); a new login replaces the previous one |
| `endSession(container)` | after the withdrawal, and the development sign-out |

Screens that need a login guard in `beforeLoad` with `requireLogin(location)` (`apps/web/app/presentation/session.ts`), which sends a visitor to MY-02 with the current location in `next` (CS-04). The login flows return there through `safeNextPath`:

```ts
// apps/web/app/presentation/login.ts
export const completeLoginByCodeFn = createServerFn({ method: "POST" })
  // …
  .handler(async ({ data }) => {
    // …
    const { accountId } = await completeLoginByCode({
      container,
      input: { challengeId: data.challengeId, code: data.code },
    });
    await startSession(container, accountId);
    return { next: safeNextPath(data.next) };
  });
```

After a login or logout the client reconciles every route (`router.invalidate({ sync: true })`) and then moves on. The mail link's page redeems its token only after hydration (`apps/web/app/components/account/LinkLogin/index.tsx`), so a mail scanner that fetches the link without script cannot use it up; opening the link is still all the user does.

## 7. Errors and the common states

The server side is `docs/backend_implementation_example.md` (7. Error design). On the client:

- `classifyError(error)` (`apps/web/app/presentation/errorState.ts`) turns anything a server function or loader threw into an `ErrorState`: `invalidInput` (CS-10, with `fieldErrors`), `premiseChanged` (CS-08), `conflict` (CS-07), `loginRequired` (CS-04), `forbidden` (CS-05), `notFound` (CS-06 / CS-17), `failed` (CS-02). Screens branch on `kind` and, where the spec gives a state its own wording, on `code`.
- A business code's state and sentence come from the catalog (`presentBusinessError` in `apps/web/app/presentation/businessErrorCatalog.ts`, one fragment per domain in `apps/web/app/presentation/errorCatalog/`). A screen may word a code's state itself when the design gives it a title and body (MY-02's 「送信の上限」 for `AccountErrorCode.LoginRequestsExceeded`).
- A route that cannot show its content renders `RouteErrorContent` (`apps/web/app/components/feedback/RouteErrorView/index.tsx`), wired as the router's default error and not-found views in `apps/web/app/router.tsx`: CS-06 / CS-17, CS-02 with 再試行する, CS-04 with the login entry, CS-05, drawn for the shell it sits in. A route with its own wording for a state gives its own `errorComponent` (MY-03's CS-02 in `apps/web/app/routes/_account/me/notifications.tsx`).
- Error and pending views are not lazy chunks (`codeSplittingOptions` in `apps/web/vite.config.ts`), and the root keeps the site config it loaded first (`apps/web/app/routes/__root.tsx`): a navigation that fails for want of a network reaches its own route's CS-02.

## 8. Design system

- Tokens: `apps/web/app/styles/tokens.css` (colors, type scale, spacing, radii, from `spec/design/tokens.md`). `apps/web/app/styles/theme.css` clears Tailwind's defaults and bridges the tokens: `--spacing: 1px`, so a utility number is a pixel token step (`gap-16`, `p-21`, `h-64`); colors are the token names (`text-ink`, `bg-paper`).
- Component classes follow the HTML designs' names: the management shell `m-*` in `apps/web/app/styles/manage.css`, shared parts in `apps/web/app/styles/components.css`, and screen-specific rules (`my-*`, `my02-*`, `om07-*`, …) in `apps/web/app/styles/pages.css`. Copy a design's block from `spec/design/pages/*.html`, map its `m-btn` / `m-link` / `m-notice` / `m-heading` to `Button` / `TextButton` / `Notice variant="manage"` / `SectionTitle variant="manage"`, and add only the screen's own rules to `pages.css`.
- Fonts are self-hosted with `@fontsource/noto-sans-jp` / `@fontsource/noto-serif-jp`, imported in `apps/web/app/styles/index.css`.
- Icons are the design's glyphs drawn in `currentColor`: `<Icon name="chevron" />` (`apps/web/app/components/ui/Icon/index.tsx`); the control around it carries the accessible name.
- `/__dev/ui` and `/__dev/ui/manage` show the parts and the management frame (`apps/web/app/routes/[__dev]/ui/index.tsx`, `apps/web/app/routes/[__dev]/ui/manage.tsx`).

## 9. Development tools

Everything under `/__dev/*` exists only while the server's `DEV_TOOLS` setting is on (`requireDevTools` in `apps/web/app/presentation/devTools.ts` answers not-found otherwise; the server functions refuse with `ForbiddenError`).

| Route | Use |
| --- | --- |
| `/__dev/inbox` | the development inbox (`MAIL_TRANSPORT=devInbox`): login mails with clickable links and codes, notification mails; filter by recipient (`apps/web/app/routes/[__dev]/inbox.tsx`) |
| `/__dev/idp/authorize` | the fake external provider behind 「Google でログイン」: answer verified / unverified / no address / cancel (`apps/web/app/routes/[__dev]/idp/authorize.tsx`) |
| `/__dev/session` | who the session belongs to; exercises the CS-04 guard |
| `/__dev/errors/$kind` | each failure kind rendered as its common state |

MY-02 also shows 「開発用のログイン」 (sign in as any address without a mail, `DevSignInForm`) and MY-01 a development sign-out while the tools are on. The first operator is set with `POST /__ops/operators/establish` (`docs/runtime_cloudflare_do.md`).
