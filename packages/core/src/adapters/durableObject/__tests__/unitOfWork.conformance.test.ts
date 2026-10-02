import { describeUnitOfWorkContract } from "../__conformance__/unitOfWork";
import { createNodeHarness } from "../testing/nodeHarness";

// Node backend: the Durable Object's store code on `node:sqlite`. The same
// suite runs against the real object in the Workers pool.
describeUnitOfWorkContract(async () => createNodeHarness());
