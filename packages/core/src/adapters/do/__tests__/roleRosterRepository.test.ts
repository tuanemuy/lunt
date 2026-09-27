import { SystemError } from "@repo/core/application/errors";
import { AccountId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { createNodeHarness } from "../testing/nodeHarness";

const HOLDER = AccountId.create("ffffffff-ffff-7fff-8fff-000000000001");

describe("DoRoleRosterRepository", () => {
  it("findRolesOf refuses a stored role it does not know, as find does", async () => {
    const h = createNodeHarness();
    h.state.storage.sql.exec(
      "INSERT INTO role_holders (account_id, role) VALUES (?, ?), (?, ?)",
      HOLDER,
      "editor",
      HOLDER,
      "wizard",
    );
    const error = await h.uow
      .run(({ roleRosterRepository }) =>
        roleRosterRepository.findRolesOf(HOLDER),
      )
      .catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(SystemError);
    expect(error).toMatchObject({ code: "DATA_INTEGRITY_ERROR" });
  });

  it("findRolesOf answers the stored roles", async () => {
    const h = createNodeHarness();
    h.state.storage.sql.exec(
      "INSERT INTO role_holders (account_id, role) VALUES (?, ?)",
      HOLDER,
      "editor",
    );
    expect(
      await h.uow.run(({ roleRosterRepository }) =>
        roleRosterRepository.findRolesOf(HOLDER),
      ),
    ).toEqual(new Set(["editor"]));
  });
});
