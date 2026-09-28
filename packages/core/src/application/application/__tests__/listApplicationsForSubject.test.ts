import type { StewardedRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { listApplicationsForSubject } from "../listApplicationsForSubject";
import { type ReviewKit, reviewKit } from "./reviewKit";

const read = (k: ReviewKit, who: Person, subject: StewardedRef) =>
  listApplicationsForSubject({
    container: k.container,
    actor: who.actor,
    input: { subject, pagination: { page: 1, limit: 100 } },
  });

describe("listApplicationsForSubject", () => {
  it.todo(
    "listApplicationsForSubject#1 利用者 R は地域 X の運営者。X への所属の申請 x1（最も先に提出、承認）、離脱の申請 x2（次に提出、確認中）、所属の申請 x3（次に提出、否認）、所属の申請 x4（最後に提出、差し戻し）が保存されている / R が X の申請を読む",
  );

  it.todo(
    "listApplicationsForSubject#2 X への所属の申請 x5 は、サービス運営者が期間超過の代行で承認した / R が X の申請を読む",
  );

  it.todo(
    "listApplicationsForSubject#3 利用者 V はイベント e1 の運営者。e1 への参加の申請が、掲載 l1 と参加日を添えて確認中 / V が e1 の申請を読む",
  );

  it.todo(
    "listApplicationsForSubject#4 e1 への参加の申請に添えた掲載 l1 が、確認中に削除された / V が e1 の申請を読む",
  );

  it.todo(
    "listApplicationsForSubject#5 地域 Y に運営者がいない。操作する人はサービス運営者 O / O が Y の申請を読む",
  );

  it("an operator reads a region without stewards as its absence proxy", async () => {
    const k = await reviewKit();

    expect(await read(k, k.O, k.region("Y"))).toEqual({
      items: [],
      count: 0,
      underReviewCount: 0,
    });
  });

  it.todo(
    "listApplicationsForSubject#6 利用者 S は店舗 p1 の店舗管理者。p1 について店舗管理者として行った所属の申請 a1（確認中、別の店舗管理者 T が提出）、参加の申請 a2（差し戻し）、離脱の申請 a3（承認）と、利用者 B が個人として行った p1 の管理権限の申請 a4（確認中）が保存されている / S が p1 の申請を読む",
  );

  it("a place's steward reads only the applications made as its steward: individuals' applications about the place are left out", async () => {
    const k = await reviewKit();
    const S = await k.person("S");
    const B = await k.person("B");
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 0);
    await k.claim(B, { placeId: p1 });
    await k.revise(B, p1);
    await k.appoint({ kind: "place", id: p1 }, S);

    expect(await read(k, S, { kind: "place", id: p1 })).toEqual({
      items: [],
      count: 0,
      underReviewCount: null,
    });
  });

  it("listApplicationsForSubject#7 X への申請が1件もない / R が X の申請を読む", async () => {
    const k = await reviewKit();
    const R = await k.person("R");
    const X = k.region("X");
    await k.appoint(X, R);

    expect(await read(k, R, X)).toEqual({
      items: [],
      count: 0,
      underReviewCount: 0,
    });
  });

  it("listApplicationsForSubject#8 利用者 U は X の運営者でも、サービス運営者でもない / U が X の申請を読む", async () => {
    const k = await reviewKit();
    const U = await k.person("U");
    const R = await k.person("R");
    const X = k.region("X");
    await k.appoint(X, R);

    await expectCode(read(k, U, X), ForbiddenError);
  });

  it("listApplicationsForSubject#9 地域 X に運営者がいる。サービス運営者 O は X の運営者でない / O が X の申請を読む", async () => {
    const k = await reviewKit();
    const R = await k.person("R");
    const X = k.region("X");
    await k.appoint(X, R);

    await expectCode(read(k, k.O, X), ForbiddenError);
  });

  it("listApplicationsForSubject#10 T は店舗 p1 の店舗管理者を辞任している / T が p1 の申請を読む", async () => {
    const k = await reviewKit();
    const T = await k.person("T");
    const S = await k.person("S");
    const p1 = { kind: "place", id: await k.place() } as const;
    await k.appoint(p1, T, S);
    await k.removeSteward(p1, T);

    await expectCode(read(k, T, p1), ForbiddenError);
  });

  it("listApplicationsForSubject#11 店舗 p2 に店舗管理者がいない。操作する人はサービス運営者 O / O が p2 の申請を読む", async () => {
    const k = await reviewKit();
    const p2 = { kind: "place", id: await k.place() } as const;

    await expectCode(read(k, k.O, p2), ForbiddenError);
  });
});
