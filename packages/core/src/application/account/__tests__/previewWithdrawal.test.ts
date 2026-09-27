import { DoStewardedTargetDirectory } from "@repo/core/adapters/do/stewardedTargetDirectory";
import { Account } from "@repo/core/domain/account/entity";
import type { StewardedTargetDirectory } from "@repo/core/domain/authority/ports/stewardedTargetDirectory";
import { StewardedTargetOrder } from "@repo/core/domain/authority/stewardedTarget";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import { OccasionId, PlaceId, RegionId } from "@repo/core/domain/common/ids";
import { Place } from "@repo/core/domain/place/place";
import { sampleProfile } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import { createTestContainer } from "../../__tests__/testContainer";
import {
  authorityKit,
  type Kit,
  type Person,
} from "../../authority/__tests__/kit";
import { TestStewardedTargets } from "../../authority/__tests__/testServices";
import { previewWithdrawal } from "../previewWithdrawal";

/**
 * Places from the production directory (Place's tables), every other kind
 * from `others` — regions and occasions have no tables before S3A.
 */
function placesFromStore(
  store: StewardedTargetDirectory,
  others: StewardedTargetDirectory,
): StewardedTargetDirectory {
  return {
    describe: async (targets) =>
      [
        ...(await store.describe(
          targets.filter((target) => target.kind === "place"),
        )),
        ...(await others.describe(
          targets.filter((target) => target.kind !== "place"),
        )),
      ].sort((a, b) => StewardedTargetOrder.compare(a.target, b.target)),
  };
}

const preview = (k: Kit, who: Person) =>
  previewWithdrawal({ container: k.container, actor: who.actor, input: {} });

describe("previewWithdrawal", () => {
  it("previewWithdrawal#1 アカウント A は、どの対象の管理者でもなく、役割も持たない / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    expect(await preview(k, A)).toEqual({
      canWithdraw: true,
      blockedBy: null,
      vacates: [],
    });
  });

  it("previewWithdrawal#2 A は店舗 P の唯一の管理者で、地域 R の2人の管理者の1人 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place("喫茶ルント");
    const R = k.region("北町");
    await k.appoint(P, A);
    await k.appoint(R, A, B);
    expect(await preview(k, A)).toEqual({
      canWithdraw: true,
      blockedBy: null,
      vacates: [{ target: P, name: "喫茶ルント" }],
    });
  });

  it("previewWithdrawal#3 A は店舗 P、地域 R、イベント E の唯一の管理者。R は名称が未入力の下書き。P は運営による非公開 / A を Actor として実行する", async () => {
    // P is a real place, stored suspended through Place's repository and
    // named by the production directory; R and E stay test targets until
    // Region and Occasion land (S3A).
    const targets = new TestStewardedTargets();
    const t = createTestContainer({
      overrides: (deps) => ({
        stewardedTargetDirectory: placesFromStore(
          new DoStewardedTargetDirectory(deps.client),
          targets,
        ),
      }),
    });
    const { container, idGenerator, clock } = t;
    const A = Account.register({
      id: idGenerator.next(),
      email: "steward@example.com",
    });
    const P = Place.suspend(
      Place.register(
        {
          id: PlaceId.create(idGenerator.next()),
          profile: sampleProfile({ name: "喫茶ルント" }),
        },
        clock.now(),
      ).entity,
      clock.now(),
    ).entity;
    const R = {
      kind: "region",
      id: RegionId.create(idGenerator.next()),
    } as const;
    const E = {
      kind: "occasion",
      id: OccasionId.create(idGenerator.next()),
    } as const;
    targets.add(R, null).add(E, "夏祭り");
    const who = { accountId: A.id, email: A.email };
    await container.unitOfWorkProvider.run(async (ctx) => {
      await ctx.accountRepository.insert(A);
      await ctx.placeRepository.insert(P);
      await ctx.stewardshipRepository.insert(
        Stewardship.appointByApproval(
          Stewardship.vacant(Place.ref(P)),
          who,
          clock.now(),
        ).entity,
      );
      for (const target of [R, E]) {
        await ctx.stewardshipRepository.insert(
          Stewardship.grant(Stewardship.vacant(target), who, clock.now())
            .entity,
        );
      }
    });
    expect(Place.isSuspended(P)).toBe(true);
    expect(
      (
        await previewWithdrawal({
          container,
          actor: { accountId: A.id },
          input: {},
        })
      ).vacates,
    ).toEqual([
      { target: Place.ref(P), name: "喫茶ルント" },
      { target: R, name: null },
      { target: E, name: "夏祭り" },
    ]);
  });

  it("previewWithdrawal#4 A は店舗 P の招待の宛先であるだけで、管理者ではない / A を Actor として実行する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, B);
    await k.invite(P, A.email);
    expect((await preview(k, A)).vacates).toEqual([]);
  });

  it("previewWithdrawal#5 A は唯一のサービス運営者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    await k.operators(A);
    expect(await preview(k, A)).toEqual({
      canWithdraw: false,
      blockedBy: { role: "operator", reason: "last_operator" },
      vacates: [],
    });
  });

  it("previewWithdrawal#6 A と B がサービス運営者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    await k.operators(A, B);
    expect(await preview(k, A)).toMatchObject({
      canWithdraw: true,
      blockedBy: null,
    });
  });

  it("previewWithdrawal#7 A は唯一の編集担当者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    await k.editors(A);
    expect(await preview(k, A)).toMatchObject({
      canWithdraw: true,
      blockedBy: null,
    });
  });

  it("previewWithdrawal#8 A は店舗 P の唯一の管理者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    const P = k.place();
    await k.appoint(P, A);
    const before = await Promise.all([
      k.getAccount(A),
      k.findStewardship(P),
      k.roster("operator"),
      k.roster("editor"),
    ]);
    const mark = await k.mark();
    await preview(k, A);
    expect(
      await Promise.all([
        k.getAccount(A),
        k.findStewardship(P),
        k.roster("operator"),
        k.roster("editor"),
      ]),
    ).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
  });

  it("names more than 100 vacated targets, 100 at a time, in listing order", async () => {
    const k = authorityKit();
    const A = await k.person();
    const places = Array.from({ length: 101 }, (_, i) => k.place(`店舗${i}`));
    for (const place of places) await k.appoint(place, A);
    const { vacates } = await preview(k, A);
    expect(vacates).toHaveLength(101);
    expect(vacates.every((summary) => summary.name?.startsWith("店舗"))).toBe(
      true,
    );
  });
});
