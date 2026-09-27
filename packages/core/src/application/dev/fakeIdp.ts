import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

/** What the developer chose on the fake provider's screen. */
export type FakeIdpChoice =
  | Readonly<{ kind: "verified"; email: string }>
  | Readonly<{ kind: "unverified"; email: string }>
  | Readonly<{ kind: "no_email" }>
  | Readonly<{ kind: "cancel" }>;

/** An authorization request the fake provider's screen can answer. */
export type FakeIdpRequest = Readonly<{
  /** Path of this app the answer returns the browser to. */
  returnsTo: string;
  /**
   * Where to send the browser back to: the callback with a signed code,
   * or with `error=access_denied` on cancel.
   */
  answer(choice: FakeIdpChoice, now: Date): Promise<string>;
}>;

/**
 * The development fake provider's side of an authorization (design.md
 * D-07). On the container as `fakeIdp` when `EXTERNAL_IDP=fake`, `null`
 * otherwise.
 */
export interface FakeIdp {
  /**
   * The request in `query` (the screen's raw query string), or `null`
   * when it is not a valid request that returns to this app — the fake
   * provider is no open redirector.
   */
  open(query: string): FakeIdpRequest | null;
}

export type FakeIdpRequestView =
  | Readonly<{ kind: "valid"; returnsTo: string }>
  | Readonly<{ kind: "invalid" }>;

function requireFakeIdp(container: ServiceArgs<unknown>["container"]): FakeIdp {
  if (!container.runtime.devTools || container.fakeIdp === null) {
    throw new ForbiddenError(
      "DEV_TOOLS_DISABLED",
      "The development fake provider is disabled",
    );
  }
  return container.fakeIdp;
}

/**
 * Development tool: what the fake provider's screen (`/__dev/idp/authorize`)
 * was opened with. `ForbiddenError` `DEV_TOOLS_DISABLED` unless the
 * development tools and the fake provider are on.
 */
export async function checkFakeIdpRequest({
  container,
  input,
}: ServiceArgs<Readonly<{ query: string }>>): Promise<FakeIdpRequestView> {
  const request = requireFakeIdp(container).open(input.query);
  return request === null
    ? { kind: "invalid" }
    : { kind: "valid", returnsTo: request.returnsTo };
}

/**
 * Development tool: the fake provider's answer to the request — where to
 * send the browser back to. `NotFoundError` `FAKE_IDP_REQUEST_INVALID`
 * for a request it cannot answer.
 */
export async function answerFakeIdp({
  container,
  input,
}: ServiceArgs<Readonly<{ query: string; choice: FakeIdpChoice }>>): Promise<
  Readonly<{ location: string }>
> {
  const request = requireFakeIdp(container).open(input.query);
  if (request === null) {
    throw new NotFoundError(
      "FAKE_IDP_REQUEST_INVALID",
      "The authorization request is invalid",
    );
  }
  return {
    location: await request.answer(input.choice, container.clock.now()),
  };
}
