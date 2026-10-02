import type { LuntStateClient } from "@repo/core/adapters/durableObject/protocol/client";
import type { PresentationPorts } from "./presentationPorts";
import type { RuntimeSettings, SharedDeps } from "./types";

/**
 * What every domain's `create…Services` receives besides its own env: the
 * state object client (for read-only query ports), the shared ports, the
 * runtime settings, and the ports the presentation layer implements.
 */
export type ServiceDeps = Readonly<{
  client: LuntStateClient;
  shared: SharedDeps;
  runtime: RuntimeSettings;
  presentation: PresentationPorts;
}>;
