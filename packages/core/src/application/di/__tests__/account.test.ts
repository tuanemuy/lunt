import { createInProcessState } from "@repo/core/adapters/do/testing/inProcessState";
import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../__tests__/fakes/fakeClock";
import { FakeLogger } from "../../__tests__/fakes/fakeLogger";
import {
  type AccountEnv,
  createAccountServices,
  DEFAULT_LOGIN_CHALLENGE_TTL_MS,
  DEFAULT_LOGIN_MAX_CODE_ATTEMPTS,
  DEFAULT_LOGIN_MAX_UNEXPIRED_CHALLENGES,
  readExternalIdpSettings,
  readLoginSettings,
} from "../account";
import { parseMailFrom, readMailSettings } from "../mail";
import type { ServiceDeps } from "../serviceDeps";

const APP_URL = "http://localhost:3000";

const SMTP: AccountEnv = {
  APP_URL,
  MAIL_TRANSPORT: "smtp",
  MAIL_FROM: "Lunt <no-reply@lunt.jp>",
  SMTP_HOST: "smtp.example.com",
  SMTP_USERNAME: "user",
  SMTP_PASSWORD: "pass",
};

function deps(devTools: boolean): ServiceDeps {
  const clock = new FakeClock();
  const idGenerator = new FakeIdGenerator();
  return {
    client: createInProcessState({ clock, idGenerator }).client,
    shared: { clock, idGenerator, logger: new FakeLogger() },
    runtime: { devTools, sessionSecret: "s".repeat(32), opsToken: null },
    presentation: {},
  };
}

describe("Account wiring", () => {
  it("defaults the login settings and reads overrides", () => {
    expect(readLoginSettings({ APP_URL })).toEqual({
      challengeValidForMs: DEFAULT_LOGIN_CHALLENGE_TTL_MS,
      maxCodeAttempts: DEFAULT_LOGIN_MAX_CODE_ATTEMPTS,
      maxUnexpiredChallenges: DEFAULT_LOGIN_MAX_UNEXPIRED_CHALLENGES,
    });
    expect(
      readLoginSettings({
        APP_URL,
        LOGIN_CHALLENGE_TTL_MS: "600000",
        LOGIN_MAX_CODE_ATTEMPTS: "3",
        LOGIN_MAX_UNEXPIRED_CHALLENGES: "2",
      }),
    ).toEqual({
      challengeValidForMs: 600000,
      maxCodeAttempts: 3,
      maxUnexpiredChallenges: 2,
    });
    expect(() =>
      readLoginSettings({ APP_URL, LOGIN_MAX_CODE_ATTEMPTS: "0" }),
    ).toThrow();
    expect(() =>
      readLoginSettings({ APP_URL, LOGIN_MAX_UNEXPIRED_CHALLENGES: "0" }),
    ).toThrow();
  });

  it("uses the development inbox by default, only with the development tools", () => {
    expect(readMailSettings({}, true)).toMatchObject({ transport: "devInbox" });
    expect(() => readMailSettings({}, false)).toThrow("DEV_TOOLS");
    expect(
      createAccountServices({ APP_URL }, deps(true)).devInbox,
    ).not.toBeNull();
  });

  it("requires the SMTP settings and accepts only port 465", () => {
    expect(readMailSettings(SMTP, false)).toEqual({
      transport: "smtp",
      from: { name: "Lunt", email: "no-reply@lunt.jp" },
      host: "smtp.example.com",
      port: 465,
      username: "user",
      password: "pass",
    });
    expect(() =>
      readMailSettings({ ...SMTP, SMTP_PORT: "587" }, false),
    ).toThrow();
    expect(() =>
      readMailSettings({ ...SMTP, SMTP_PASSWORD: undefined }, false),
    ).toThrow();
    expect(() =>
      readMailSettings({ ...SMTP, MAIL_FROM: "nobody" }, false),
    ).toThrow();
  });

  it("uses the fake provider by default, only with the development tools", () => {
    expect(readExternalIdpSettings({ APP_URL }, true)).toEqual({ idp: "fake" });
    expect(() => readExternalIdpSettings({ APP_URL }, false)).toThrow(
      "DEV_TOOLS",
    );
    expect(
      readExternalIdpSettings(
        {
          APP_URL,
          EXTERNAL_IDP: "google",
          GOOGLE_CLIENT_ID: "id",
          GOOGLE_CLIENT_SECRET: "secret",
        },
        false,
      ),
    ).toEqual({ idp: "google", clientId: "id", clientSecret: "secret" });
    expect(() =>
      readExternalIdpSettings({ APP_URL, EXTERNAL_IDP: "google" }, false),
    ).toThrow();
  });

  it("wires a production configuration without development adapters", async () => {
    const services = createAccountServices(
      {
        ...SMTP,
        EXTERNAL_IDP: "google",
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
      },
      deps(false),
    );
    expect(services.devInbox).toBeNull();
    expect(services.externalLoginStarter.providers).toEqual(["google"]);
  });

  it("parses the sender mailbox", () => {
    expect(parseMailFrom("Lunt <a@b.jp>")).toEqual({
      name: "Lunt",
      email: "a@b.jp",
    });
    expect(parseMailFrom('"Lunt 運営" <a@b.jp>')).toEqual({
      name: "Lunt 運営",
      email: "a@b.jp",
    });
    expect(parseMailFrom("a@b.jp")).toEqual({ email: "a@b.jp" });
    expect(parseMailFrom("Lunt")).toBeNull();
  });
});
