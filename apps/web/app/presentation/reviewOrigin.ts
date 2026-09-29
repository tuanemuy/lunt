import { z } from "zod";

/**
 * The list CM-01 was opened from (`?from=`): OM-01, a region's RM-01 or an
 * event's EM-01. Before the application is read — and when it cannot be
 * (CS-17 「元の一覧へ戻れる」) — only this names the way back and the
 * frame. `null` when CM-01 was opened otherwise (a notification, a link).
 */
export type ReviewOrigin =
  | Readonly<{ kind: "ops" }>
  | Readonly<{ kind: "region"; id: string }>
  | Readonly<{ kind: "occasion"; id: string }>;

const FROM = /^(?:ops|(region|event):([A-Za-z0-9_-]{1,64}))$/;

export const reviewSearchSchema = z.object({
  from: z.string().max(80).regex(FROM).optional().catch(undefined),
});

export type ReviewSearch = z.infer<typeof reviewSearchSchema>;

export function reviewOriginOf(search: ReviewSearch): ReviewOrigin | null {
  const match = search.from === undefined ? null : FROM.exec(search.from);
  if (match === null) return null;
  const [, kind, id] = match;
  if (id === undefined) return { kind: "ops" };
  return kind === "region" ? { kind: "region", id } : { kind: "occasion", id };
}

/** `?from=` naming `origin`, for the links into CM-01. */
export function reviewFrom(origin: ReviewOrigin): string {
  switch (origin.kind) {
    case "ops":
      return "ops";
    case "region":
      return `region:${origin.id}`;
    case "occasion":
      return `event:${origin.id}`;
  }
}

/** The brand label, the list to return to and its label, by where CM-01 was opened from. */
export function reviewOriginFrame(origin: ReviewOrigin | null): Readonly<{
  context: string;
  back: Readonly<{ to: string; label: string }> | null;
}> {
  switch (origin?.kind) {
    case "ops":
      return {
        context: "サービス運営",
        back: { to: "/ops", label: "対応が必要なものへ戻る" },
      };
    case "region":
      return {
        context: "地域の運営",
        back: {
          to: `/manage/regions/${encodeURIComponent(origin.id)}`,
          label: "所属店舗と申請へ戻る",
        },
      };
    case "occasion":
      return {
        context: "イベントの運営",
        back: {
          to: `/manage/events/${encodeURIComponent(origin.id)}`,
          label: "参加店舗と申請へ戻る",
        },
      };
    case undefined:
      return { context: "管理", back: null };
  }
}
