import { createFileRoute } from "@tanstack/react-router";
import { DevClock } from "@/components/dev/DevClock";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageShell,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { readDevClockFn } from "@/presentation/devClock";
import { requireDevTools } from "@/presentation/devTools";

/**
 * Development tool (F-06): move the application's time forward and run
 * the daily jobs by hand, for manual tests (`docs/manual_test.md`).
 */
export const Route = createFileRoute("/__dev/clock")({
  beforeLoad: () => requireDevTools(),
  loader: () => readDevClockFn(),
  head: () => ({ meta: [{ title: "Clock — Lunt" }] }),
  component: ClockPage,
});

function ClockPage() {
  const clock = Route.useLoaderData();
  return (
    <ManageShell context="開発用" homeTo="/">
      <ManagePage
        title={
          <ManageTitle>
            <ManageHeading>時刻と日次のジョブ</ManageHeading>
          </ManageTitle>
        }
      >
        <ManageBody>
          <DevClock clock={clock} />
        </ManageBody>
      </ManagePage>
    </ManageShell>
  );
}
