import { describeExplorationQueriesContract } from "@repo/core/adapters/do/__conformance__/explorationQueries";
import { createDiscoveryDoHarness } from "./discoveryDoHarness";

describeExplorationQueriesContract(createDiscoveryDoHarness);
