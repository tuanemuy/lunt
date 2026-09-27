import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { EventId } from "@repo/core/domain/common/event";
import type { DeliveredOccurrence } from "@repo/core/domain/notification/delivery";
import { NotificationMail } from "@repo/core/domain/notification/mail";
import { notificationIds } from "@repo/core/domain/notification/testing/samples";
import { describe, expect, it } from "vitest";
import { createNotificationMailRenderer } from "../notificationMail";

const APP_URL = "https://lunt.example";
const LIST_URL = `${APP_URL}/me/notifications`;
const renderer = createNotificationMailRenderer({
  appUrl: APP_URL,
  siteName: "Lunt",
});
const ids = notificationIds();
const to = EmailAddress.create("someone@example.com");

const render = (delivered: DeliveredOccurrence) =>
  renderer.render(
    NotificationMail.compose(
      { by: "event", eventId: EventId.create("mail-test") },
      delivered,
      to,
      [],
    ),
  );

describe("notification mail", () => {
  it("does not point an invitation at the notification list: the address may have no account", () => {
    const mail = render({
      occurrence: {
        to: "invitee",
        email: to,
        target: { kind: "place", id: ids.place() },
        invitationId: ids.invitation(),
      },
      delivery: "direct",
    });
    expect(mail.body).not.toContain(LIST_URL);
    expect(mail.body).not.toContain("通知一覧");
  });

  it("points an account's notification mail at the notification list", () => {
    const mail = render({
      occurrence: { to: "grantee", granted: { kind: "role", role: "editor" } },
      delivery: "direct",
    });
    expect(mail.body).toContain(LIST_URL);
  });
});
