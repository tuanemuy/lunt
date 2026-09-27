import { ConflictError } from "@repo/core/application/errors";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import { isBusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import {
  findAllStewardshipsOf,
  previewAuthorityLoss,
  removeAllAuthorityOf,
} from "../withdrawal";
import { authorityKit, commitAfter, rejection, stewardIds } from "./kit";

describe("Authority's part of a withdrawal", () => {
  it("previews the vacated targets and a last-operator block without writing", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const [P1, P2, R] = [k.place(), k.place(), k.region()];
    await k.appoint(P1, A);
    await k.appoint(P2, A, B);
    await k.appoint(R, A);
    await k.operators(A);
    const mark = await k.mark();
    const preview = await k.container.unitOfWorkProvider.run((ctx) =>
      previewAuthorityLoss(ctx, A.accountId),
    );
    expect(preview).toEqual({
      blockedBy: { role: "operator", reason: "last_operator" },
      vacates: [P1, R],
    });
    expect(await k.since(mark)).toEqual([]);
    expect(
      await k.container.unitOfWorkProvider.run((ctx) =>
        previewAuthorityLoss(ctx, B.accountId),
      ),
    ).toEqual({ blockedBy: null, vacates: [] });
  });

  it("removes every stewardship and role in one unit of work and drafts their events", async () => {
    const k = authorityKit();
    const [A, B, O] = [await k.person(), await k.person(), await k.person()];
    const [P1, P2] = [k.place(), k.place()];
    await k.appoint(P1, A);
    await k.appoint(P2, A, B);
    await k.operators(O, A);
    await k.editors(A);
    const mark = await k.mark();
    await k.withdraw(A);
    expect((await k.stewardship(P1)).status).toBe("vacant");
    expect(stewardIds(await k.stewardship(P2))).toEqual([B.accountId]);
    expect(await k.holders("operator")).toEqual([O.accountId]);
    expect(await k.holders("editor")).toEqual([]);
    expect((await k.since(mark)).map((e) => [e.type, e.aggregateId])).toEqual([
      ["authority.role_revoked", "editor"],
      ["authority.role_revoked", "operator"],
      ["authority.steward_removed", `place:${P1.id}`],
      ["authority.stewardship_vacated", `place:${P1.id}`],
      ["authority.steward_removed", `place:${P2.id}`],
    ]);
  });

  it("refuses the last operator and writes nothing", async () => {
    const k = authorityKit();
    const A = await k.person();
    const P = k.place();
    await k.appoint(P, A);
    await k.operators(A);
    const error = await rejection(
      k.container.unitOfWorkProvider.run((ctx) =>
        removeAllAuthorityOf(ctx, A.accountId, k.tick()),
      ),
    );
    expect(isBusinessRuleError(error)).toBe(true);
    expect((error as { code?: unknown }).code).toBe("AUTHORITY_LAST_OPERATOR");
    expect(stewardIds(await k.stewardship(P))).toEqual([A.accountId]);
  });

  it("conflicts with an appointment that commits first", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const racing = commitAfter(k.container, () => k.appoint(P, B));
    const error = await rejection(
      racing.unitOfWorkProvider.run(async (ctx) => {
        ctx.collectEvents(
          await removeAllAuthorityOf(ctx, A.accountId, k.tick()),
        );
      }),
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect(stewardIds(await k.stewardship(P))).toEqual([
      A.accountId,
      B.accountId,
    ]);
  });

  it("reads every page of the account's stewardships", async () => {
    const k = authorityKit();
    const A = await k.person();
    const places = Array.from({ length: 101 }, () => k.place());
    await k.container.unitOfWorkProvider.run(async (ctx) => {
      for (const P of places) {
        await ctx.stewardshipRepository.insert(
          Stewardship.appointByApproval(Stewardship.vacant(P), A, k.tick())
            .entity,
        );
      }
    });
    const all = await k.container.unitOfWorkProvider.run((ctx) =>
      findAllStewardshipsOf(ctx, A.accountId),
    );
    expect(all.map((s) => s.entity.target)).toEqual(places);
  });
});
