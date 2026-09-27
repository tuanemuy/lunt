import { createTestContainer } from "@repo/core/application/__tests__/testContainer";
import { ConflictError } from "@repo/core/application/errors";
import { listCategories } from "@repo/core/application/listing/listCategories";
import { provisionInitialCategories } from "@repo/core/application/listing/provisionInitialCategories";
import { describe, expect, it } from "vitest";
import { handleCategoryProvisioning } from "../opsCategories";

describe("handleCategoryProvisioning", () => {
  it("provisions the four opening categories, then answers that nothing was written", async () => {
    const { container } = createTestContainer();
    const provision = () => provisionInitialCategories({ container });

    const first = await handleCategoryProvisioning(provision);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ provisioned: true });

    const again = await handleCategoryProvisioning(provision);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ provisioned: false });

    expect(
      (await listCategories({ container })).map((category) => category.name),
    ).toEqual(["食べる", "買う", "体験", "見る"]);
  });

  it("answers a lost race with the serialized conflict", async () => {
    const response = await handleCategoryProvisioning(async () => {
      throw new ConflictError("OPTIMISTIC_LOCK_FAILURE", "catalog changed");
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { kind: "conflict" },
    });
  });
});
