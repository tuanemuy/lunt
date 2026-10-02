import { FakeClock } from "@repo/core/application/__tests__/fakes/fakeClock";
import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import {
  DevInboxMailTransport,
  DoDevInbox,
} from "../../durableObject/devInbox";
import { createInProcessState } from "../../durableObject/testing/inProcessState";
import { InMemoryMailTransport } from "../../inMemory/inMemoryMailTransport";
import { describeLoginMailSenderContract } from "../__conformance__/loginMailSender";
import { MailLoginMailSender } from "../mailLoginMailSender";

const APP_URL = "http://localhost:3000";
const SETTINGS = { appUrl: APP_URL, siteName: "Lunt", validForMs: 900_000 };
const RECIPIENTS = [
  EmailAddress.create("first@example.com"),
  EmailAddress.create("second@example.com"),
] as const;

// The usecase tests' sender: the production renderer over a transport
// that keeps mail in memory.
describeLoginMailSenderContract("test transport", async () => {
  const transport = new InMemoryMailTransport();
  return {
    sender: new MailLoginMailSender(transport, SETTINGS),
    appUrl: APP_URL,
    recipients: RECIPIENTS,
    observe: async (to) => transport.sentTo(to),
  };
});

// The development inbox: stored in the state object's `dev_mailbox`, read
// back the way `/__dev/inbox` reads it. The real Durable Object runs the
// same suite in the Workers pool.
describeLoginMailSenderContract("development inbox", async () => {
  const clock = new FakeClock();
  const idGenerator = new FakeIdGenerator();
  const state = createInProcessState({ clock, idGenerator });
  const inbox = new DoDevInbox(state.client);
  return {
    sender: new MailLoginMailSender(
      new DevInboxMailTransport(state.client, {
        clock,
        idGenerator,
        from: "Lunt <no-reply@lunt.example>",
      }),
      SETTINGS,
    ),
    appUrl: APP_URL,
    recipients: RECIPIENTS,
    observe: (to) => inbox.list({ to, limit: 100 }),
  };
});
