import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { EventId } from "@repo/core/domain/common/event";
import { TakedownClaimId } from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import { ModerationEvents } from "@repo/core/domain/moderation/events";
import { TakedownOutcomeMail } from "@repo/core/domain/notification/mail";
import { describe, expect, it } from "vitest";
import { consumers, subscribersOf } from "../../events/consumers";
import { resolveTakedownClaim } from "../../moderation/resolveTakedownClaim";
import { submitTakedownClaim } from "../../moderation/submitTakedownClaim";
import { sendTakedownOutcome } from "../sendTakedownOutcome";
import { type Kit, notificationKit, type Person } from "./kit";

const M = "claimant@example.com";
const DONE =
  "申し立てのあった写真を削除しました。ご連絡ありがとうございました。";
const NO_ACTION =
  "確認の結果、権利の侵害は認められなかったため、措置は行いません。";

/** An operator, and `target`'s claim from `email` resolved through Moderation. */
async function resolvedClaim(
  k: Kit,
  target: ContentRef,
  options: Readonly<{
    outcome?: string;
    email?: string;
    operator?: Person;
  }> = {},
) {
  const O = options.operator ?? (await k.person("o"));
  if (options.operator === undefined) await k.operators(O);
  const Cl = await k.takedownClaim(target, options.email ?? M);
  await resolveTakedownClaim({
    container: k.container,
    actor: O.actor,
    input: { claimId: Cl, outcome: options.outcome ?? DONE },
  });
  return { O, Cl, e: resolvedEvent(k, Cl) };
}

const resolvedEvent = (k: Kit, Cl: TakedownClaimId) => ({
  ...ModerationEvents.takedownClaimResolved(Cl, k.tick()),
  id: EventId.create(k.t.idGenerator.next()),
});

const consume = (k: Kit, e: ReturnType<typeof resolvedEvent>) => {
  k.tick();
  return sendTakedownOutcome.handle(k.container, e);
};

const readClaim = (k: Kit, Cl: TakedownClaimId) =>
  k.container.unitOfWorkProvider.run(({ takedownClaimRepository }) =>
    takedownClaimRepository.findById(Cl),
  );

async function dispatched(k: Kit, Cl: TakedownClaimId): Promise<boolean> {
  const found = await readClaim(k, Cl);
  if (found === null || found.entity.status !== "resolved") {
    throw new Error("not resolved");
  }
  const key = TakedownOutcomeMail.keyOf(found.entity);
  const records = await k.container.unitOfWorkProvider.run(
    ({ mailDispatchLedger }) => mailDispatchLedger.findDispatched([key]),
  );
  return records.length === 1;
}

describe("sendTakedownOutcome", () => {
  it("sendTakedownOutcome#1 掲載 L への申立て Cl（メールアドレス M）が、行った措置を結果に添えて対応済みになった。送信済みの記録はない / Cl の takedown_claim.resolved を消費する", async () => {
    const k = notificationKit();
    const P = k.place("店舗P");
    const L = await k.listing(P, { name: "掲載L" });
    const { Cl, e } = await resolvedClaim(k, L);
    const before = await readClaim(k, Cl);
    const events = await k.storedEventCount();
    expect(await dispatched(k, Cl)).toBe(false);
    await expect(consume(k, e)).resolves.toBeUndefined();
    const mails = k.mailsTo(M);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: M, link: null });
    expect(mails[0]?.body).toContain(`listing:${L.id}="掲載L"`);
    expect(mails[0]?.body).toContain(
      before?.entity.receivedAt.toISOString() ?? "missing",
    );
    expect(mails[0]?.body).toContain(DONE);
    expect(await dispatched(k, Cl)).toBe(true);
    expect(await readClaim(k, Cl)).toEqual(before);
    expect(await k.storedEventCount()).toBe(events);
  });

  it("sendTakedownOutcome#2 申立て Cl が、措置を行わないことを結果に添えて対応済みになった / Cl の takedown_claim.resolved を消費する", async () => {
    const k = notificationKit();
    const P = k.place("店舗P");
    const { Cl, e } = await resolvedClaim(k, P, { outcome: NO_ACTION });
    await consume(k, e);
    expect(k.mailsTo(M)).toHaveLength(1);
    expect(k.mailsTo(M)[0]?.body).toContain(NO_ACTION);
    expect(await dispatched(k, Cl)).toBe(true);
  });

  it("sendTakedownOutcome#3 対応済みの申立て Cl の対象が、対応の後に削除されている / Cl の takedown_claim.resolved を消費する", async () => {
    const k = notificationKit();
    const P = k.place("店舗P");
    const L = await k.listing(P, { name: "掲載L" });
    const { e } = await resolvedClaim(k, L);
    k.directory.remove(L);
    await consume(k, e);
    const [mail] = k.mailsTo(M);
    expect(mail?.body).toContain(`listing:${L.id}=null`);
  });

  it("sendTakedownOutcome#4 対象が閲覧できない（運営による非公開の）申立て Cl が対応済みになった / Cl の takedown_claim.resolved を消費する", async () => {
    const k = notificationKit();
    // The directory names content whether viewers can see it or not.
    const P = k.place("非公開の店舗P");
    const { e } = await resolvedClaim(k, P);
    await consume(k, e);
    expect(k.mailsTo(M)[0]?.body).toContain(`place:${P.id}="非公開の店舗P"`);
  });

  it("sendTakedownOutcome#5 Cl の結果のメールを送り、送信済みの記録がある / 同じ takedown_claim.resolved をもう一度消費する", async () => {
    const k = notificationKit();
    const { e } = await resolvedClaim(k, k.place("店舗P"));
    await consume(k, e);
    await expect(consume(k, e)).resolves.toBeUndefined();
    expect(k.mailer.sent).toHaveLength(1);
    expect(k.mailsTo(M)).toHaveLength(1);
  });

  it("sendTakedownOutcome#6 対応済みの申立て Cl がある。Mailer.send が失敗する / Cl の takedown_claim.resolved を消費する", async () => {
    const k = notificationKit();
    const { Cl, e } = await resolvedClaim(k, k.place("店舗P"));
    const before = await readClaim(k, Cl);
    k.mailer.failWhen(() => true);
    await expect(consume(k, e)).rejects.toThrow();
    expect(k.mailsTo(M)).toEqual([]);
    expect(await dispatched(k, Cl)).toBe(false);
    expect(await readClaim(k, Cl)).toEqual(before);
    expect(before?.entity).toMatchObject({ status: "resolved", outcome: DONE });
  });

  it("sendTakedownOutcome#7 上の失敗の後、Mailer.send が成功するようになった / 同じ takedown_claim.resolved をもう一度消費する", async () => {
    const k = notificationKit();
    const { Cl, e } = await resolvedClaim(k, k.place("店舗P"));
    k.mailer.failWhen(() => true);
    await expect(consume(k, e)).rejects.toThrow();
    k.mailer.failWhen(null);
    await expect(consume(k, e)).resolves.toBeUndefined();
    expect(k.mailsTo(M)).toHaveLength(1);
    expect(await dispatched(k, Cl)).toBe(true);
  });

  it("sendTakedownOutcome#8 M のアカウントがあり、同じ M に通知のメールも送っている / Cl の takedown_claim.resolved を消費する", async () => {
    const k = notificationKit();
    const O = await k.person("o");
    await k.operators(O);
    const P = k.place("店舗P");
    const Cl = await k.takedownClaim(P, O.email);
    await k.consume(
      k.event(ModerationEvents.takedownClaimSubmitted(Cl, k.tick())),
    );
    const notified = await k.notificationsOf(O);
    expect(notified).toHaveLength(1);
    expect(k.mailsTo(O)).toHaveLength(1);
    await resolveTakedownClaim({
      container: k.container,
      actor: O.actor,
      input: { claimId: Cl, outcome: DONE },
    });
    await consume(k, resolvedEvent(k, Cl));
    const mails = k.mailsTo(O);
    expect(mails).toHaveLength(2);
    expect(mails[1]?.body).toContain(DONE);
    expect(await k.notificationsOf(O)).toEqual(notified);
    const found = await readClaim(k, Cl);
    if (found === null || found.entity.status !== "resolved") {
      throw new Error("not resolved");
    }
    const outcomeKey = TakedownOutcomeMail.keyOf(found.entity);
    const [notification] = notified;
    expect(outcomeKey.occurrenceKey).not.toBe(notification?.occurrenceKey);
    expect(await dispatched(k, Cl)).toBe(true);
  });

  it("sendTakedownOutcome#9 閲覧できる掲載がある / submitTakedownClaim で申立てを提出し、takedown_claim.submitted が配送される", async () => {
    const k = notificationKit();
    const O = await k.person("o");
    await k.operators(O);
    const P = await k.registeredPlace("店舗P");
    const { ref: L, photoId } = await k.publishedListing(P, "掲載L");
    const claimId = k.t.idGenerator.next();
    await submitTakedownClaim({
      container: k.container,
      input: {
        claimId,
        standing: "photoRightsHolder",
        target: L,
        photoIds: [photoId],
        reason: "写真の権利を侵害しています",
        email: M,
      },
    });
    expect(subscribersOf(consumers, "takedown_claim.submitted")).toEqual([
      "deliverNotifications",
    ]);
    const Cl = TakedownClaimId.create(claimId);
    await k.consume(
      k.event(ModerationEvents.takedownClaimSubmitted(Cl, k.tick())),
    );
    expect(k.mailsTo(M)).toEqual([]);
    expect(await k.notificationsOf(O)).toEqual([
      expect.objectContaining({
        occurrence: {
          to: "operators",
          matter: { kind: "takedown_claim_received", claimId: Cl },
        },
      }),
    ]);
    expect(k.mailsTo(O)).toHaveLength(1);
  });
});

describe("sendTakedownOutcome consumer", () => {
  it("subscribes to takedown_claim.resolved only", () => {
    expect(sendTakedownOutcome.events).toEqual(["takedown_claim.resolved"]);
    expect(subscribersOf(consumers, "takedown_claim.resolved")).toEqual([
      "sendTakedownOutcome",
    ]);
  });

  it("mails the address the claim holds, even one without an account", async () => {
    const k = notificationKit();
    const email = k.unregisteredEmail("claimant");
    const { e } = await resolvedClaim(k, k.place("店舗P"), { email });
    await consume(k, e);
    expect(k.mailsTo(EmailAddress.create(email))).toHaveLength(1);
  });
});
