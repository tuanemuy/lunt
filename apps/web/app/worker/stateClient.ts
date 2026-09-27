import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";

/** Every aggregate lives in this one object (design.md D-02). */
export const STATE_OBJECT_NAME = "global";

/**
 * The stub of the global Lunt state object, placed near Japan.
 *
 * The stub's RPC methods mirror `LuntStateClient` by construction (the
 * DO class implements that surface), but the platform types wrap each
 * return in RPC promise/stub machinery that TS cannot relate back to the
 * structural interface — hence the single widening cast, at the only
 * place a stub is minted.
 */
export function stateClient(
  namespace: DurableObjectNamespace,
  name: string = STATE_OBJECT_NAME,
): LuntStateClient {
  const stub = namespace.get(namespace.idFromName(name), {
    locationHint: "apac",
  });
  return stub as unknown as LuntStateClient;
}
