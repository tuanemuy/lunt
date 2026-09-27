import { ConflictError, ForbiddenError } from "@repo/core/application/errors";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import type { RequestContainer } from "../../di/types";
import { acceptInvitation } from "../acceptInvitation";
import { getMyAuthority } from "../getMyAuthority";
import { resignStewardship } from "../resignStewardship";
import { revokeSteward } from "../revokeSteward";
import { viewMembers } from "../viewMembers";
import {
  authorityKit,
  commitAfter,
  expectCode,
  invitationEmails,
  type Kit,
  type Person,
  stewardIds,
} from "./kit";

const resign = (
  k: Kit,
  who: Person,
  target: StewardedRef,
  container: RequestContainer = k.container,
) => resignStewardship({ container, actor: who.actor, input: { target } });

describe("resignStewardship", () => {
  it("resignStewardship#1 A、B は店舗 P の管理者 / A を Actor として P の管理権限を辞任する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A, B);
    const mark = await k.mark();
    await resign(k, A, P);
    const after = await k.stewardship(P);
    expect(after.status).toBe("stewarded");
    expect(stewardIds(after)).toEqual([B.accountId]);
    expect(await k.since(mark)).toEqual([
      expect.objectContaining({
        type: "authority.steward_removed",
        payload: { target: P, accountId: A.accountId, reason: "resigned" },
      }),
    ]);
  });

  it("resignStewardship#2 上のケースの後 / A を Actor として getMyAuthority と、P の viewMembers を実行する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A, B);
    await resign(k, A, P);
    const mine = await getMyAuthority({
      container: k.container,
      actor: A.actor,
      input: { pagination: { page: 1, limit: 100 } },
    });
    expect(mine.stewarded.items.map((item) => item.target)).not.toContainEqual(
      P,
    );
    await expectCode(
      viewMembers({
        container: k.container,
        actor: A.actor,
        input: { target: P },
      }),
      ForbiddenError,
    );
  });

  it("resignStewardship#3 A は地域 R の唯一の管理者 / A を Actor として辞任する", async () => {
    const k = authorityKit();
    const A = await k.person();
    const R = k.region("谷中");
    await k.appoint(R, A);
    const mark = await k.mark();
    await resign(k, A, R);
    expect((await k.stewardship(R)).status).toBe("vacant");
    expect(await k.since(mark)).toEqual([
      expect.objectContaining({
        type: "authority.steward_removed",
        payload: { target: R, accountId: A.accountId, reason: "resigned" },
      }),
      expect.objectContaining({
        type: "authority.stewardship_vacated",
        payload: { target: R },
      }),
    ]);
    expect(await k.container.stewardedTargetDirectory.describe([R])).toEqual([
      { target: R, name: "谷中" },
    ]);
  });

  it("resignStewardship#4 A は店舗 P の唯一の管理者。A が送った C 宛ての承諾前の招待がある / A を Actor として辞任し、その後 C を Actor として招待を承諾する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    await resign(k, A, P);
    const vacant = await k.stewardship(P);
    expect(vacant.status).toBe("vacant");
    expect(invitationEmails(vacant)).toEqual([C.email]);
    await acceptInvitation({
      container: k.container,
      actor: C.actor,
      input: { target: P, invitationId: invitation },
    });
    const after = await k.stewardship(P);
    expect(after.status).toBe("stewarded");
    expect(stewardIds(after)).toEqual([C.accountId]);
  });

  it("resignStewardship#5 店舗 P の管理者は B。X は P の管理者でない / X を Actor として P の管理権限を辞任する", async () => {
    const k = authorityKit();
    const [B, X] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, B);
    const before = await k.findStewardship(P);
    await expectCode(resign(k, X, P), ForbiddenError);
    expect(await k.findStewardship(P)).toEqual(before);
  });

  it("resignStewardship#6 A は店舗 P の管理者だったが、すでに辞任している / A を Actor として、もう一度辞任する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A, B);
    await resign(k, A, P);
    const mark = await k.mark();
    await expectCode(resign(k, A, P), ForbiddenError);
    expect(await k.since(mark)).toEqual([]);
  });

  it("resignStewardship#7 A は店舗 P1 と店舗 P2 の管理者 / A を Actor として P1 の管理権限を辞任する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const [P1, P2] = [k.place(), k.place()];
    await k.appoint(P1, A, B);
    await k.appoint(P2, A);
    const p2Before = await k.findStewardship(P2);
    await resign(k, A, P1);
    expect(stewardIds(await k.stewardship(P1))).toEqual([B.accountId]);
    expect(await k.findStewardship(P2)).toEqual(p2Before);
  });

  it("resignStewardship#8 A、B は店舗 P の管理者。O はサービス運営者 / A の辞任と、O による A の解除を同時に実行し、解除が先に確定する", async () => {
    const k = authorityKit();
    const [A, B, O] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A, B);
    await k.operators(O);
    const racing = commitAfter(k.container, () =>
      revokeSteward({
        container: k.container,
        actor: O.actor,
        input: { target: P, accountId: A.accountId },
      }),
    );
    await expectCode(resign(k, A, P, racing), ConflictError);
    await expectCode(resign(k, A, P), ForbiddenError);
    expect(stewardIds(await k.stewardship(P))).toEqual([B.accountId]);
  });
});
