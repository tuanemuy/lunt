import { createTestAreaCatalog } from "@repo/core/adapters/staticAssets/testing/testAreaMaster";
import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { AreaServices } from "../services";

/**
 * Area's container ports for usecase tests: the production `AreaCatalog`
 * adapter over 「テスト用のマスター」 (`spec/testcases/ports/areaCatalog.md`).
 */
export function createTestAreaServices(_deps: TestServiceDeps): AreaServices {
  return { areaCatalog: createTestAreaCatalog() };
}
