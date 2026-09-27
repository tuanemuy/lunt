// The one Lunt Worker (design.md D-05): TanStack Start's fetch handler
// (plus the operator endpoints under /__ops/), the events queue consumer,
// the dead-letter queue, and the daily Cron Trigger — all over the single Lunt state Durable Object, which this
// module also exports so wrangler can bind it.
import { AsyncLocalStorage } from "node:async_hooks";
import type {
  DurableObjectNamespace,
  ExecutionContext,
  MessageBatch,
  ScheduledController,
} from "@cloudflare/workers-types";
import { DoConsumerReceipts } from "@repo/core/adapters/do/consumerReceipts";
import {
  createRequestContainer,
  type LuntEnv,
} from "@repo/core/application/di/container";
import { installContainerStore } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import { consumers } from "@repo/core/application/events/consumers";
import { dailyJobs } from "@repo/core/application/workers/dailyJobRegistry";
import { runDailyJobs } from "@repo/core/application/workers/dailyJobs";
import type { EventMessage } from "@repo/core/application/workers/eventDelivery";
import { default as defaultEntry } from "@tanstack/react-start/server-entry";
import { LuntStateObject } from "./durable-objects/luntState";
import { presentationPorts } from "./presentation/ports";
import { handleOpsRequest, OPS_PREFIX } from "./worker/ops";
import { handleQueueBatch } from "./worker/queue";
import { stateClient } from "./worker/stateClient";

export { LuntStateObject };

// SSR and RSC module graphs share one realm but not one module instance,
// and Vite HMR re-evaluates this file; the ALS therefore lives on a
// `Symbol.for` slot of `globalThis` (and in `import.meta.hot.data`) so
// every graph and every re-evaluation reads the same store.
const ALS_SYMBOL: unique symbol = Symbol.for("lunt/request-als") as never;
type AlsHotData = { als?: AsyncLocalStorage<RequestContainer> };
type AlsGlobalSlot = { [ALS_SYMBOL]?: AsyncLocalStorage<RequestContainer> };
const alsHotData: AlsHotData = (import.meta.hot?.data ?? {}) as AlsHotData;
const alsGlobal = globalThis as unknown as AlsGlobalSlot;
const storage =
  alsGlobal[ALS_SYMBOL] ??
  alsHotData.als ??
  new AsyncLocalStorage<RequestContainer>();
alsGlobal[ALS_SYMBOL] = storage;
if (import.meta.hot) {
  (import.meta.hot.data as AlsHotData).als = storage;
}
installContainerStore({ getStore: () => storage.getStore() });

export type AppEnv = LuntEnv &
  Readonly<{
    LUNT_STATE: DurableObjectNamespace;
  }>;

export default {
  async fetch(
    request: Request,
    env: AppEnv,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const client = stateClient(env.LUNT_STATE);
    const container = createRequestContainer(env, client, presentationPorts);
    if (new URL(request.url).pathname.startsWith(OPS_PREFIX)) {
      return handleOpsRequest(request, {
        opsToken: container.runtime.opsToken,
        client,
      });
    }
    return storage.run(container, async () => defaultEntry.fetch(request));
  },

  async queue(
    batch: MessageBatch<EventMessage>,
    env: AppEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const client = stateClient(env.LUNT_STATE);
    const container = createRequestContainer(env, client, presentationPorts);
    await handleQueueBatch(batch, {
      container,
      receipts: new DoConsumerReceipts(client),
      registry: consumers,
      recordDeadLetter: (input) => client.recordDeadLetter(input),
      inScope: (fn) => storage.run(container, fn),
    });
  },

  async scheduled(
    _controller: ScheduledController,
    env: AppEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const container = createRequestContainer(
      env,
      stateClient(env.LUNT_STATE),
      presentationPorts,
    );
    await storage.run(container, () => runDailyJobs(container, dailyJobs));
  },
};
