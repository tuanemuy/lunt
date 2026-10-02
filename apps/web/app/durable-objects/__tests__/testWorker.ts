// `main` module of the Workers-pool integration tests. Exports the real
// `LuntStateObject`, plus `RelayProbeStateObject`: the same object with
// a test-only event type and two test consumers wired into its relay, so
// the whole commit → alarm → queue → consumer → receipt path runs end to
// end before any production event type exists.
import type {
  DurableObjectNamespace,
  MessageBatch,
} from "@cloudflare/workers-types";
import { DoConsumerReceipts } from "@repo/core/adapters/durableObject/consumerReceipts";
import { createRequestContainer } from "@repo/core/application/di/container";
import type {
  ConsumerRegistry,
  EventConsumer,
} from "@repo/core/application/events/consumers";
import type { EventDecoderRegistry } from "@repo/core/application/events/registry";
import type { EventMessage } from "@repo/core/application/workers/eventDelivery";
import type { DomainEvent, EventDecoder } from "@repo/core/domain/common/event";
import { presentationPorts } from "../../presentation/ports";
import { handleQueueBatch } from "../../worker/queue";
import { stateClient } from "../../worker/stateClient";
import { LuntStateObject } from "../luntState";

export { LuntStateObject };

export const PROBE_EVENT_TYPE = "probe.pinged";

const probeDecoder: EventDecoder<DomainEvent> = (payload, meta) => ({
  type: PROBE_EVENT_TYPE,
  payload: payload as Record<string, unknown>,
  ...meta,
});

// The registries are typed over the production event union, which the
// probe type is deliberately not part of.
const probeDecoders = {
  [PROBE_EVENT_TYPE]: probeDecoder,
} as unknown as EventDecoderRegistry;

const succeeds = {
  events: [PROBE_EVENT_TYPE],
  handle: async () => {},
} as unknown as EventConsumer;

/**
 * Whether `probeFails` succeeds. The pool loads this module into the same
 * isolate as the tests, so a test can "fix the cause" before a re-drive.
 */
export const probeHealth = { failing: true };

const alwaysFails = {
  events: [PROBE_EVENT_TYPE],
  handle: async () => {
    if (probeHealth.failing) throw new Error("probe consumer failure");
  },
} as unknown as EventConsumer;

export const probeConsumers: ConsumerRegistry = {
  probeSucceeds: succeeds,
  probeFails: alwaysFails,
};

export class RelayProbeStateObject extends LuntStateObject {
  protected override relayRegistries() {
    return { decoders: probeDecoders, consumers: probeConsumers };
  }
}

type TestEnv = Readonly<{
  APP_URL: string;
  DEV_TOOLS: string;
  SESSION_SECRET: string;
  RELAY_PROBE_STATE: DurableObjectNamespace;
}>;

export default {
  // Each probe event names the probe object it came from in
  // `aggregateId`, so receipts go back to that object.
  async queue(batch: MessageBatch<EventMessage>, env: TestEnv) {
    for (const message of batch.messages) {
      const client = stateClient(
        env.RELAY_PROBE_STATE,
        message.body.event.aggregateId,
      );
      const container = createRequestContainer(env, client, presentationPorts);
      await handleQueueBatch(
        { ...batch, messages: [message] },
        {
          container,
          receipts: new DoConsumerReceipts(client),
          registry: probeConsumers,
          recordDeadLetter: (input) => client.recordDeadLetter(input),
          inScope: (fn) => fn(),
          // Probe events have no stored-event decoder; they carry no dates.
          rebuild: (event) => event,
        },
      );
    }
  },
};
