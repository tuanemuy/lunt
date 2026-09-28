import type { ApplicationKind } from "@repo/core/domain/application/application";
import type { ApplicationStatusKind } from "@repo/core/domain/application/status";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { paginationSchema } from "./pagination";
import { validateInput } from "./validator";

/**
 * MY-04 自分の申請の一覧 (`spec/pages/account.md`): the row data, the URL's
 * place filter and the server functions. Server-only reads live in
 * `myApplicationsData.ts`.
 */

/** One application as MY-04 lists it. */
export type MyApplicationItem = Readonly<{
  id: string;
  kind: ApplicationKind;
  /** 店舗の登録申請 · 菓子工房 まるめ */
  title: string;
  status: ApplicationStatusKind;
  /** 申請者 あなた（個人） · 9月20日に提出 */
  meta: string;
  /** 店舗はまだありません, 店舗の登録申請に併せた申請 … */
  notes: readonly string[];
}>;

/** A page of MY-04; `place` is the store the list is narrowed to. */
export type MyApplicationsPage = Readonly<{
  items: readonly MyApplicationItem[];
  count: number;
  place: Readonly<{ id: string; name: string | null }> | null;
}>;

/** Rows per page (CF-05 loads the next as the list is read). */
export const MY_APPLICATIONS_PAGE_SIZE = 20;

const placeField = z.string().trim().min(1).max(128);

/** `?place=` from SM-01・SM-05・SM-06; anything malformed drops the filter. */
export const myApplicationsSearchSchema = z.object({
  place: placeField.optional().catch(undefined),
});

export const myApplicationsPageSchema = paginationSchema.extend({
  place: placeField.nullable(),
});

/**
 * MY-04's filter (「店舗の申請」): the store, when the viewer may act for it
 * (CS-05 otherwise). Runs in `beforeLoad` so the refusal can be shown with
 * its own wording rather than as a redacted render error.
 */
export const loadApplicationsFilterFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(z.object({ place: placeField })))
  .handler(
    async ({
      data,
    }): Promise<Readonly<{ id: string; name: string | null }>> => {
      const { loadApplicationsFilter } = await import("./myApplicationsData");
      return loadApplicationsFilter(data.place);
    },
  );

/** MY-04: a further page of the viewer's applications. */
export const listMyApplicationsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(myApplicationsPageSchema))
  .handler(async ({ data }): Promise<MyApplicationsPage> => {
    const { loadMyApplicationsPage } = await import("./myApplicationsData");
    return loadMyApplicationsPage(data.place, {
      page: data.page,
      limit: data.limit,
    });
  });
