import { FakeClock } from "@repo/core/application/__tests__/fakes/fakeClock";
import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { createInProcessState } from "../../do/testing/inProcessState";
import { describeMailerContract } from "../__conformance__/mailer";
import { DevInboxMailTransport, DoDevInbox } from "../devInbox";
import { TransportMailer } from "../mailer";
import { InMemoryMailTransport } from "../testing/inMemoryMailTransport";

const RECIPIENTS = [
  EmailAddress.create("first@example.com"),
  EmailAddress.create("second@example.com"),
] as const;

// The production mailer over a transport that keeps mail in memory.
describeMailerContract("test transport", async () => {
  const transport = new InMemoryMailTransport();
  return {
    mailer: new TransportMailer(transport),
    recipients: RECIPIENTS,
    observe: async (to) =>
      transport.sentTo(to).map((mail) => ({
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      })),
  };
});

// The development inbox: stored in the state object's `dev_mailbox`, read
// back the way `/__dev/inbox` reads it. The real Durable Object runs the
// same suite in the Workers pool.
describeMailerContract("development inbox", async () => {
  const clock = new FakeClock();
  const idGenerator = new FakeIdGenerator();
  const state = createInProcessState({ clock, idGenerator });
  const inbox = new DoDevInbox(state.client);
  return {
    mailer: new TransportMailer(
      new DevInboxMailTransport(state.client, {
        clock,
        idGenerator,
        from: "Lunt <no-reply@lunt.example>",
      }),
    ),
    recipients: RECIPIENTS,
    observe: (to) => inbox.list({ to, limit: 100 }),
  };
});
