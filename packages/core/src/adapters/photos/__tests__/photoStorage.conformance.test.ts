import { createNodeHarness } from "@repo/core/adapters/do/testing/nodeHarness";
import {
  describePhotoStorageContract,
  fetchThrough,
} from "../__conformance__/photoStorage";
import { servePhoto } from "../photoDelivery";
import { R2PhotoStorage } from "../r2PhotoStorage";
import { InMemoryPhotoBucket } from "../testing/inMemoryPhotoBucket";

// Node backend: `R2PhotoStorage` over an in-memory bucket, refs followed
// through `servePhoto`. The same suite runs against a real (Miniflare) R2
// bucket and the Worker's photo route in the Workers pool.
describePhotoStorageContract(async () => {
  const bucket = new InMemoryPhotoBucket();
  return {
    storage: new R2PhotoStorage(bucket),
    fetch: (ref) => fetchThrough((request) => servePhoto(bucket, request), ref),
    uow: createNodeHarness().uow,
  };
});
