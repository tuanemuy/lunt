import { describeLoginChallengeRepositoryContract } from "../__conformance__/loginChallengeRepository";
import { createNodeHarness } from "../testing/nodeHarness";

// Node backend: the Durable Object's store code on `node:sqlite`. The same
// suite runs against the real object in the Workers pool.
describeLoginChallengeRepositoryContract(async () => createNodeHarness());
