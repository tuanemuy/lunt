import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import { NotificationDestination } from "@repo/core/domain/notification/destination";
import type {
  NotificationMail,
  RefLabel,
  RenderedMail,
  TakedownOutcomeMail,
} from "@repo/core/domain/notification/mail";
import type { Mailer } from "@repo/core/domain/notification/ports/mailer";
import type { NotificationMailRenderer } from "@repo/core/domain/notification/ports/notificationMailRenderer";
import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { NotificationServices } from "../services";

/**
 * Notification's container ports for usecase tests: fakes for external IO,
 * the real adapters (over the in-process state object) for everything
 * else. The renderer is presentation's in production; core tests use the
 * deterministic fake below.
 */
export function createTestNotificationServices(
  _deps: TestServiceDeps,
): NotificationServices {
  return {
    notificationMailRenderer: new TestNotificationMailRenderer(),
    mailer: new TestMailer(),
  };
}

const sorted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sorted(v)]),
    );
  }
  return value;
};

/** The fake renderer's "URL" of a destination: stable, one per destination. */
export const testDestinationUrl = (d: NotificationDestination): string =>
  `lunt-test://open/${encodeURIComponent(JSON.stringify(sorted(d)))}`;

const labelText = (label: RefLabel): string =>
  `${label.ref.kind}:${label.ref.id}=${JSON.stringify(label.label)}`;

/**
 * A `NotificationMailRenderer` that spells out what it was given: the
 * subject names the occurrence, the body carries the labels and the
 * destination's test URL. Deterministic, never throws.
 */
export class TestNotificationMailRenderer implements NotificationMailRenderer {
  render(mail: NotificationMail): RenderedMail {
    const link = NotificationDestination.of(mail);
    return {
      to: mail.key.to,
      subject: `[${mail.occurrence.to}] ${mail.delivery}`,
      body: [
        JSON.stringify(sorted(mail.occurrence)),
        ...mail.labels.map(labelText),
        ...(link === null ? [] : [testDestinationUrl(link)]),
      ].join("\n"),
      link,
    };
  }

  renderTakedownOutcome(mail: TakedownOutcomeMail): RenderedMail {
    return {
      to: mail.key.to,
      subject: `[takedown] ${mail.target.ref.kind}`,
      body: [
        `${mail.target.ref.kind}:${mail.target.ref.id}=${JSON.stringify(mail.target.label)}`,
        mail.receivedAt.toISOString(),
        mail.outcome,
      ].join("\n"),
      link: null,
    };
  }
}

/**
 * Test `Mailer`: keeps every accepted mail. `failWhen` makes the matching
 * sends reject as an outage would, until cleared with `failWhen(null)`.
 */
export class TestMailer implements Mailer {
  readonly sent: RenderedMail[] = [];
  private failing: ((mail: RenderedMail) => boolean) | null = null;

  failWhen(predicate: ((mail: RenderedMail) => boolean) | null): void {
    this.failing = predicate;
  }

  sentTo(to: string): readonly RenderedMail[] {
    return this.sent.filter((mail) => mail.to === to);
  }

  async send(mail: RenderedMail): Promise<void> {
    if (this.failing?.(mail)) {
      throw new SystemError(
        SystemErrorCode.ExternalApiError,
        "Mail transport is down",
      );
    }
    this.sent.push(mail);
  }
}
