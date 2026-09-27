const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

type JapanDate = Readonly<{
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  /** Days since the epoch in Japan time, for "same day" / "yesterday". */
  dayNumber: number;
}>;

function inJapan(date: Date): JapanDate {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    dayNumber: Math.floor(shifted.getTime() / (24 * HOUR_MS)),
  };
}

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * When a notification arrived, as MY-03 lists it (Japan time): `たった今`,
 * `N分前`, `N時間前` the same day, `昨日 HH:mm`, `M月D日` this year, and
 * `YYYY年M月D日` before. `now` is the server's clock of the page, so the
 * server and the browser render the same words.
 */
export function formatNotificationTime(at: Date, now: Date): string {
  const elapsed = now.getTime() - at.getTime();
  const then = inJapan(at);
  const today = inJapan(now);
  if (elapsed < MINUTE_MS) return "たった今";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}分前`;
  if (then.dayNumber === today.dayNumber) {
    return `${Math.floor(elapsed / HOUR_MS)}時間前`;
  }
  if (then.dayNumber === today.dayNumber - 1) {
    return `昨日 ${pad(then.hours)}:${pad(then.minutes)}`;
  }
  return then.year === today.year
    ? `${then.month}月${then.day}日`
    : `${then.year}年${then.month}月${then.day}日`;
}
