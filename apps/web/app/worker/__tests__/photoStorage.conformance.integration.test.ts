import { env } from "cloudflare:test";
import {
  describePhotoStorageContract,
  fetchThrough,
} from "@repo/core/adapters/r2/__conformance__/photoStorage";
import { R2PhotoStorage } from "@repo/core/adapters/r2/r2PhotoStorage";
import { createDoHarness } from "../../durable-objects/__tests__/doHarness";
import { handlePhotoRequest } from "../photos";

// Workers backend: `R2PhotoStorage` over the pool's real (Miniflare) R2
// bucket, refs followed through the Worker's photo route.
describePhotoStorageContract(async () => ({
  storage: new R2PhotoStorage(env.PHOTOS),
  fetch: (ref) =>
    fetchThrough((request) => handlePhotoRequest(request, env.PHOTOS), ref),
  uow: (await createDoHarness()).uow,
}));
