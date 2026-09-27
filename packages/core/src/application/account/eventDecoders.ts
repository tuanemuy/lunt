import type { AccountEvent } from "@repo/core/domain/account/events";
import type { EventDecoder } from "@repo/core/domain/common/event";
import { AccountId } from "@repo/core/domain/common/ids";
import { z } from "zod";
import { SystemError, SystemErrorCode } from "../errors";
import { buildEventDecoder } from "../events/buildDecoder";

type AccountEventDecoders = {
  readonly [K in AccountEvent["type"]]: EventDecoder<
    Extract<AccountEvent, { type: K }>
  >;
};

/** Decoders of Account's events as stored in the outbox. */
export const accountEventDecoders: AccountEventDecoders = {
  "account.withdrawn": buildEventDecoder(
    "account.withdrawn",
    z.object({ accountId: z.string() }).strict(),
    (p) => {
      try {
        return { accountId: AccountId.create(p.accountId) };
      } catch (error) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored account event holds an invalid value",
          error,
        );
      }
    },
  ),
};
