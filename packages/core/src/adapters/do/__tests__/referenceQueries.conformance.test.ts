import { describeReferenceQueriesContract } from "../__conformance__/referenceQueries";
import { createNodeDiscoveryHarness } from "../testing/nodeDiscoveryHarness";

describeReferenceQueriesContract(createNodeDiscoveryHarness);
