import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import type { DiscoveryHarness } from "../__conformance__/discoveryFixtures";
import { DoDetailQueries } from "../detailQueries";
import { DoExplorationQueries } from "../explorationQueries";
import { DoKeywordSearchQueries } from "../keywordSearchQueries";
import { DoReferenceQueries } from "../referenceQueries";
import { createNodeHarness } from "./nodeHarness";

/** Discovery's read ports over a fresh in-memory store (`createNodeHarness`). */
export async function createNodeDiscoveryHarness(): Promise<DiscoveryHarness> {
  const h = createNodeHarness();
  const idGenerator = new FakeIdGenerator();
  return {
    uow: h.uow,
    savedEvents: h.savedEvents,
    detailQueries: new DoDetailQueries(h.state.client, idGenerator),
    referenceQueries: new DoReferenceQueries(h.state.client, idGenerator),
    explorationQueries: new DoExplorationQueries(h.state.client, idGenerator),
    keywordSearchQueries: new DoKeywordSearchQueries(
      h.state.client,
      idGenerator,
    ),
  };
}
