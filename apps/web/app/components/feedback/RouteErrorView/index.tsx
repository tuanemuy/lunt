import {
  useLocation,
  useMatch,
  useMatches,
  useRouter,
} from "@tanstack/react-router";
import { useTransition } from "react";
import { ManageBody, ManagePage } from "@/components/layout/ManageShell";
import { ViewerShell } from "@/components/layout/ViewerShell";
import { Button } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Feedback } from "@/components/ui/Feedback";
import { TextLink } from "@/components/ui/TextButton";
import { classifyError, type ErrorState } from "@/presentation/errorState";

/** What a route could not show: a missing page / target, or a thrown error. */
export type RouteProblem =
  | Readonly<{ kind: "notFound" }>
  | Readonly<{ kind: "error"; error: unknown }>;

/** The shell the content sits in; `bare` when no layout shell has rendered. */
type Area = "viewer" | "manage" | "bare";

const MY_PAGE = "/me";
const LOGIN = "/login";

type View = Readonly<{
  title: string;
  body: string;
  retry: boolean;
  /** Where the user can go on (CS-02 / CS-06 / CS-17 onward paths). */
  onward: "home" | "myPage" | "login";
}>;

/**
 * The common state a route shows instead of its content
 * (`spec/pages/index.md`): CS-06 for a missing page or a target the
 * viewer cannot see (CS-17 on management screens), CS-02 for a failed
 * load, CS-04 / CS-05 when the load needed a login or a permission, and
 * the error's own sentence for the rest.
 */
function viewOf(problem: RouteProblem, area: Area): View {
  const state: ErrorState | { kind: "missing" } =
    problem.kind === "notFound"
      ? { kind: "missing" }
      : classifyError(problem.error);
  switch (state.kind) {
    case "missing":
    case "notFound":
      return area === "manage"
        ? {
            title: "対象が見つかりません",
            body: "削除されたか、存在しない対象です。元の一覧から開き直してください。",
            retry: false,
            onward: "myPage",
          }
        : {
            title: "表示できません",
            body: "このページは見つからないか、いまは公開されていません。",
            retry: false,
            onward: "home",
          };
    case "failed":
      return {
        title: "通信エラーが発生しました",
        body: "時間をおいて、もう一度お試しください。",
        retry: true,
        onward: area === "manage" ? "myPage" : "home",
      };
    case "loginRequired":
      return {
        title: "ログインが必要です",
        body: "この画面を開くには、ログインしてください。",
        retry: false,
        onward: "login",
      };
    case "forbidden":
      return {
        title: "この画面を開く権限がありません",
        body: "必要な管理権限・役割がありません。マイページから、管理できる対象を開いてください。",
        retry: false,
        onward: "myPage",
      };
    default:
      return {
        title: "表示できませんでした",
        body: state.message,
        retry: true,
        onward: area === "manage" ? "myPage" : "home",
      };
  }
}

const MANAGE_LAYOUTS = ["/_account", "/_manage", "/_apply"];

/**
 * The shell around this boundary: decided by the layouts *above* the
 * route that failed. A failing layout has not drawn its own shell.
 */
function useArea(): Area {
  const current = useMatch({
    strict: false,
    select: (match): string => String(match.routeId),
  });
  return useMatches({
    select: (matches): Area => {
      const ids = matches.map((match) => match.routeId as string);
      const index = ids.indexOf(current);
      const shells = index === -1 ? [] : ids.slice(0, index);
      if (shells.some((id) => MANAGE_LAYOUTS.some((l) => id.startsWith(l)))) {
        return "manage";
      }
      return shells.some((id) => id.startsWith("/_viewer")) ? "viewer" : "bare";
    },
  });
}

function Onward({ onward }: { onward: View["onward"] }) {
  const href = useLocation({ select: (location) => location.href });
  switch (onward) {
    case "home":
      return <TextLink to="/">みつけるへ</TextLink>;
    case "myPage":
      return <TextLink to={MY_PAGE}>マイページへ</TextLink>;
    case "login":
      return (
        <TextLink to={LOGIN} search={{ next: href }}>
          ログインする
        </TextLink>
      );
  }
}

function RetryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await router.invalidate({ sync: true });
        })
      }
    >
      {pending ? "読み込んでいます…" : "再試行する"}
    </Button>
  );
}

/**
 * A route's error or not-found content, drawn for the shell it sits in:
 * the viewer's `Feedback` or the management `EmptyPanel`. `inManageShell`
 * is for a management layout that failed itself and draws its own frame
 * around this content.
 */
export function RouteErrorContent({
  problem,
  inManageShell = false,
}: {
  problem: RouteProblem;
  inManageShell?: boolean;
}) {
  const detected = useArea();
  const area: Area = inManageShell ? "manage" : detected;
  const view = viewOf(problem, area);
  const retry = view.retry ? <RetryButton /> : undefined;
  if (area === "manage") {
    // The design's management states (`m-empty`) sit under the screen's
    // own title band; a route that failed has no screen title, so the
    // state's title is the page heading and the sentence its body.
    return (
      <ManagePage title={null}>
        <ManageBody>
          <EmptyPanel
            title={view.title}
            headingLevel="h1"
            actions={
              <>
                {retry}
                <Onward onward={view.onward} />
              </>
            }
          >
            {view.body}
          </EmptyPanel>
        </ManageBody>
      </ManagePage>
    );
  }
  const content = (
    <div className="container">
      <Feedback
        kind={problem.kind === "error" ? "error" : "empty"}
        headingLevel="h1"
        title={view.title}
        body={view.body}
        {...(retry === undefined ? {} : { action: retry })}
        links={<Onward onward={view.onward} />}
      />
    </div>
  );
  return area === "bare" ? (
    <ViewerShell header={{ type: "home" }}>{content}</ViewerShell>
  ) : (
    content
  );
}

/**
 * The same content for the root route, where no layout shell has
 * rendered yet (an unknown URL, or a failure above every layout).
 */
export function RootErrorPage({ problem }: { problem: RouteProblem }) {
  return <RouteErrorContent problem={problem} />;
}
