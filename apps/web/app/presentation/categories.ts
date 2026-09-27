import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { validateInput } from "./validator";

const idField = z.string().min(1).max(64);
const nameField = z.string().max(100, "名称は100文字以内で入力してください");

export const addCategorySchema = z.object({
  categoryId: idField,
  name: nameField,
});

/** OM-06: adds a category at the end (OPE-02). Idempotent on the caller-minted id. */
export const addCategoryFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(addCategorySchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { addCategory },
      { parseGeneratedId },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/listing/addCategory"),
      import("./validator"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await addCategory({
      container,
      actor,
      input: {
        categoryId: parseGeneratedId(
          container.idGenerator,
          "categoryId",
          data.categoryId,
        ),
        name: data.name,
      },
    });
    return null;
  });

export const renameCategorySchema = z.object({
  categoryId: idField,
  name: nameField,
});

/** OM-06: renames an active category (OPE-02). */
export const renameCategoryFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(renameCategorySchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { renameCategory },
      { categoryIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/listing/renameCategory"),
      import("./targetIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await renameCategory({
      container,
      actor,
      input: { categoryId: categoryIdOf(data.categoryId), name: data.name },
    });
    return null;
  });

export const retireCategorySchema = z.object({
  categoryId: idField,
  successorId: idField,
});

/** OM-06: retires a category, moving its listings to the successor (OPE-03). */
export const retireCategoryFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(retireCategorySchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { retireCategory },
      { categoryIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/listing/retireCategory"),
      import("./targetIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await retireCategory({
      container,
      actor,
      input: {
        categoryId: categoryIdOf(data.categoryId),
        successorId: categoryIdOf(data.successorId),
      },
    });
    return null;
  });
