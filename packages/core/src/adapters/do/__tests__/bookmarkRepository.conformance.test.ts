import { describeBookmarkRepositoryContract } from "../__conformance__/bookmarkRepository";
import { createNodeHarness } from "../testing/nodeHarness";

// Node backend: the Durable Object's store code on `node:sqlite`. The same
// suite runs against the real object in the Workers pool.
describeBookmarkRepositoryContract(async () => createNodeHarness());
