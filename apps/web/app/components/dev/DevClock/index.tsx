"use client";

import { useRouter } from "@tanstack/react-router";
import { useActionState, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { SectionTitle } from "@/components/ui/SectionTitle";
import {
  advanceDevClockFn,
  type DailyJobRunView,
  type DevClockState,
  runDailyJobsFn,
} from "@/presentation/devClock";
import { useReconcile } from "@/presentation/reconcile";

const UNIT_MS = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
} as const;
type Unit = keyof typeof UNIT_MS;

const TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "full",
  timeStyle: "medium",
  timeZone: "Asia/Tokyo",
});

function describeOffset(ms: number): string {
  if (ms === 0) return "実際の時刻と同じ";
  const days = Math.floor(ms / UNIT_MS.days);
  const hours = Math.floor((ms % UNIT_MS.days) / UNIT_MS.hours);
  const minutes = Math.floor((ms % UNIT_MS.hours) / UNIT_MS.minutes);
  return `実際の時刻より ${days} 日 ${hours} 時間 ${minutes} 分 進んでいる`;
}

type AdvanceState = Readonly<{ error: string | null }>;

/**
 * Development tool (F-06): the application's time, moving it forward
 * (never back), and running the daily jobs by hand.
 */
export function DevClock({ clock }: { clock: DevClockState }) {
  const reconcile = useReconcile();
  const router = useRouter();
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState<Unit>("days");
  const [advanceState, advance, advancing] = useActionState(
    async (_: AdvanceState, form: FormData): Promise<AdvanceState> => {
      const count = Number(form.get("amount"));
      const chosen = form.get("unit");
      if (
        !Number.isInteger(count) ||
        count <= 0 ||
        typeof chosen !== "string" ||
        !(chosen in UNIT_MS)
      ) {
        return { error: "1 以上の整数を入力してください" };
      }
      try {
        await advanceDevClockFn({
          data: { ms: count * UNIT_MS[chosen as Unit] },
        });
      } catch {
        return { error: "時刻を進められませんでした" };
      }
      await reconcile();
      return { error: null };
    },
    { error: null },
  );
  const [results, setResults] = useState<readonly DailyJobRunView[] | null>(
    null,
  );
  const [jobError, setJobError] = useState<string | null>(null);
  const [running, startRun] = useTransition();

  return (
    <>
      <section className="m-section" aria-labelledby="dev-clock-now">
        <SectionTitle variant="manage" id="dev-clock-now">
          アプリケーションの時刻
        </SectionTitle>
        <p className="text-lg">
          <time dateTime={clock.now}>
            {TIME_FORMAT.format(new Date(clock.now))}
          </time>
        </p>
        <p className="m-field__help">
          {describeOffset(clock.offsetMs)}。時刻は進めるだけで、戻せません。
          進めた時刻は、次の画面の読み込み・操作・ジョブから使われます。
        </p>
      </section>

      <form action={advance} className="m-form" aria-label="時刻を進める">
        <Field id="dev-clock-amount" label="時刻を進める">
          {(control) => (
            <div className="m-inline">
              <Input
                {...control}
                name="amount"
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <Select
                name="unit"
                aria-label="単位"
                value={unit}
                onChange={(event) => setUnit(event.target.value as Unit)}
              >
                <option value="minutes">分</option>
                <option value="hours">時間</option>
                <option value="days">日</option>
              </Select>
              <Button type="submit" disabled={advancing}>
                {advancing ? "進めています…" : "進める"}
              </Button>
            </div>
          )}
        </Field>
        {advanceState.error === null ? null : (
          <Alert title={advanceState.error} />
        )}
      </form>

      <section className="m-section" aria-labelledby="dev-clock-jobs">
        <SectionTitle variant="manage" id="dev-clock-jobs">
          日次のジョブ
        </SectionTitle>
        <p className="m-field__help">
          毎日
          0:05（日本時間）に自動で走るジョブを、いまのアプリケーションの時刻で実行します。自動の実行は
          DAILY_JOBS_AUTO=off で止められます。
        </p>
        <Button
          variant="secondary"
          disabled={running}
          onClick={() =>
            startRun(async () => {
              setJobError(null);
              try {
                setResults(await runDailyJobsFn());
                await router.invalidate({ sync: true });
              } catch {
                setJobError("日次のジョブを実行できませんでした");
              }
            })
          }
        >
          {running ? "実行しています…" : "日次のジョブを実行する"}
        </Button>
        {jobError === null ? null : <Alert title={jobError} />}
        {results === null ? null : (
          <ul className="flex flex-col gap-8" aria-live="polite">
            {results.length === 0 ? (
              <li>登録されたジョブはありません</li>
            ) : null}
            {results.map((result) => (
              <li key={result.name}>
                {result.ok ? "完了" : "失敗"}: {result.name}（{result.summary}）
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
