import { FakeClock } from "@repo/core/application/__tests__/fakes/fakeClock";
import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { createTestContainer } from "@repo/core/application/__tests__/testContainer";
import { listDevInbox } from "@repo/core/application/dev/devInbox";
import { ForbiddenError } from "@repo/core/application/errors";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { describe, expect, it } from "vitest";
import { createInProcessState } from "../../do/testing/inProcessState";
import { DevInboxMailTransport, DoDevInbox } from "../devInbox";

function inbox() {
  const clock = new FakeClock();
  const idGenerator = new FakeIdGenerator();
  const state = createInProcessState({ clock, idGenerator });
  const transport = new DevInboxMailTransport(state.client, {
    clock,
    idGenerator,
    from: "Lunt <no-reply@lunt.example>",
  });
  const send = (to: string, subject: string) =>
    transport.send({ to: EmailAddress.create(to), subject, text: subject });
  return { clock, send, reader: new DoDevInbox(state.client) };
}

describe("development inbox", () => {
  it("stores what the transport sends and lists it newest first", async () => {
    const { clock, send, reader } = inbox();
    await send("a@example.com", "first");
    clock.advance(1000);
    await send("b@example.com", "second");
    await send("a@example.com", "third");
    const mails = await reader.list({ limit: 10 });
    // Same millisecond: id order.
    expect(mails.map((mail) => mail.subject)).toEqual([
      "second",
      "third",
      "first",
    ]);
    expect(mails[0]).toMatchObject({
      from: "Lunt <no-reply@lunt.example>",
      to: "b@example.com",
      text: "second",
      html: null,
      sentAt: clock.now(),
    });
  });

  it("filters by recipient, ignoring case and blanks, and honours the limit", async () => {
    const { send, reader } = inbox();
    await send("a@example.com", "one");
    await send("b@example.com", "two");
    await send("a@example.com", "three");
    expect(
      (await reader.list({ to: " A@Example.com ", limit: 10 })).map(
        (mail) => mail.subject,
      ),
    ).toEqual(["one", "three"]);
    expect(await reader.list({ to: "  ", limit: 10 })).toHaveLength(3);
    expect(await reader.list({ limit: 1 })).toHaveLength(1);
  });

  it("listDevInbox needs the development tools and tells when mail goes elsewhere", async () => {
    const { container } = createTestContainer();
    expect(await listDevInbox({ container, input: {} })).toEqual({
      kind: "inbox",
      mails: [],
    });
    expect(
      await listDevInbox({
        container: { ...container, devInbox: null },
        input: {},
      }),
    ).toEqual({ kind: "disabled" });
    await expect(
      listDevInbox({
        container: {
          ...container,
          runtime: { ...container.runtime, devTools: false },
        },
        input: {},
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
