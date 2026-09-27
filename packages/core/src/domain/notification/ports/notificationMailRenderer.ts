import type {
  NotificationMail,
  RenderedMail,
  TakedownOutcomeMail,
} from "../mail";

/**
 * Builds the subject, body and link of Notification's mails
 * (`spec/domains/notification.md` 「NotificationMailRenderer」). A pure
 * function port implemented by the presentation layer, which owns the
 * destination → URL mapping; neither Notification nor `Mailer` knows
 * screens or URLs.
 *
 * - `render`: `to` is `mail.key.to`, `link` is
 *   `NotificationDestination.of(mail)`; the body carries the link's URL when
 *   there is one. A label of `null` is rendered without a name.
 * - `renderTakedownOutcome`: `to` is `mail.key.to`, `link` is `null` (the
 *   claimant has no account); the body carries the whole outcome.
 *
 * Both are deterministic and never throw.
 */
export interface NotificationMailRenderer {
  render(mail: NotificationMail): RenderedMail;
  renderTakedownOutcome(mail: TakedownOutcomeMail): RenderedMail;
}
