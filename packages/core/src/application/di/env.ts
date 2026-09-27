import { z } from "zod";
import {
  DEFAULT_ALERT_AFTER_ATTEMPTS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_LEASE_MS,
} from "../workers/eventRelayWorker";
import { DEFAULT_OUTBOX_RETENTION_MS } from "../workers/outboxPrune";

/** Outbox relay tuning, read by the state Durable Object. */
export type TuningEnv = Readonly<{
  OUTBOX_BATCH_SIZE?: string | undefined;
  OUTBOX_LEASE_MS?: string | undefined;
  OUTBOX_ALERT_AFTER_ATTEMPTS?: string | undefined;
  OUTBOX_RETENTION_MS?: string | undefined;
}>;

const relayTuningSchema = z.object({
  batchSize: z.coerce.number().int().positive().default(DEFAULT_BATCH_SIZE),
  leaseMs: z.coerce.number().int().positive().default(DEFAULT_LEASE_MS),
  alertAfterAttempts: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_ALERT_AFTER_ATTEMPTS),
});

const pruneTuningSchema = z.object({
  retentionMs: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_OUTBOX_RETENTION_MS),
});

export type RelayTuning = z.infer<typeof relayTuningSchema>;
export type PruneTuning = z.infer<typeof pruneTuningSchema>;

export function readRelayTuning(env: TuningEnv): RelayTuning {
  return relayTuningSchema.parse({
    batchSize: env.OUTBOX_BATCH_SIZE,
    leaseMs: env.OUTBOX_LEASE_MS,
    alertAfterAttempts: env.OUTBOX_ALERT_AFTER_ATTEMPTS,
  });
}

export function readPruneTuning(env: TuningEnv): PruneTuning {
  return pruneTuningSchema.parse({
    retentionMs: env.OUTBOX_RETENTION_MS,
  });
}
