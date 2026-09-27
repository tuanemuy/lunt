import { ApplicationEvents } from "@repo/core/domain/application/events";
import { AuthorityEvents } from "@repo/core/domain/authority/events";
import type { Actor } from "@repo/core/domain/common/actor";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { describe, expect, it } from "vitest";
import { UnauthorizedError } from "../../errors";
import { listNotifications } from "../listNotifications";
import { type Kit, notificationKit, type Person } from "./kit";

const PAGE: Pagination = { page: 1, limit: 20 };

const list = (k: Kit, actor: Actor | null, pagination: Pagination = PAGE) =>
  listNotifications({ container: k.container, actor, input: { pagination } });

/** `A` stewards place P with S; an approval appoints `who` to P (S is told). */
async function stewardAddedTo(k: Kit, A: Person, who: Person) {
  const P = k.place("店舗P");
  await k.appoint(P, A, who);
  await k.consume(
    k.event(
      AuthorityEvents.stewardAppointed(
        P,
        who.accountId,
        "application",
        k.tick(),
      ),
    ),
  );
  return P;
}

describe("listNotifications", () => {
  it("listNotifications#1 利用者 A に、T1 < T2 < T3 の順に3つの通知が作られた / A として1ページ目を読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    const P = k.place("店舗P");
    const R = k.region("地域R");
    await k.consume(
      k.event(AuthorityEvents.roleGranted("editor", A.accountId, k.tick())),
    );
    await k.consume(
      k.event(
        AuthorityEvents.stewardAppointed(R, A.accountId, "grant", k.tick()),
      ),
    );
    await k.consume(
      k.event(
        AuthorityEvents.stewardRemoved(P, A.accountId, "revoked", k.tick()),
      ),
    );
    const result = await list(k, A.actor);
    expect(result.count).toBe(3);
    expect(result.items.map((item) => item.occurrence.to)).toEqual([
      "self",
      "grantee",
      "grantee",
    ]);
    const [t3, t2, t1] = result.items;
    expect(t3?.createdAt.getTime()).toBeGreaterThan(
      t2?.createdAt.getTime() ?? 0,
    );
    expect(t2?.createdAt.getTime()).toBeGreaterThan(
      t1?.createdAt.getTime() ?? 0,
    );
    expect(t3).toMatchObject({
      delivery: "direct",
      pointedContent: P,
      vacantTarget: null,
      labels: [{ ref: P, label: "店舗P" }],
      destination: null,
    });
    expect(t2).toMatchObject({
      pointedContent: R,
      labels: [{ ref: R, label: "地域R" }],
      destination: {
        kind: "grantedAuthority",
        granted: { kind: "stewardship", target: R },
      },
    });
    expect(t1).toMatchObject({
      pointedContent: null,
      labels: [],
      destination: {
        kind: "grantedAuthority",
        granted: { kind: "role", role: "editor" },
      },
    });
  });

  it("listNotifications#2 利用者 A に通知が1件もない / A として1ページ目を読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    expect(await list(k, A.actor)).toEqual({ items: [], count: 0 });
  });

  it("listNotifications#3 通知を持つ利用者がいる。ログインしていない / Actor なしで読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    await k.consume(
      k.event(AuthorityEvents.roleGranted("editor", A.accountId, k.tick())),
    );
    await expect(list(k, null)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  // S5: an editors' occurrence needs an article's showcase. The single list
  // across authorities is covered below with stage-1 events.
  it.todo(
    "listNotifications#4 利用者 A は、店舗 P の店舗管理者、地域 R の地域運営者、編集担当者を兼ねる。それぞれの立場宛ての出来事と、A が個人として行った申請の承認が起きた / A として読む",
  );
  // S2: place / listing suspensions. Filtering by recipient is covered below.
  it.todo(
    "listNotifications#5 利用者 A と利用者 B が店舗 P の店舗管理者で、店舗 P が運営による非公開になった。B には別の通知もある / A として読む",
  );
  it.todo(
    "listNotifications#6 店舗 P の掲載 L が運営による非公開になり、店舗管理者 A に通知が届いた / A として読む",
  );
  it.todo(
    "listNotifications#7 店舗管理者が不在の店舗 V の掲載 LV が運営による非公開になり、サービス運営者 O に通知が届いた / O として読む",
  );
  it("listNotifications#8 店舗管理者として行った申請 Ap が、最後の店舗管理者の退会で失効し、サービス運営者 O に失効の通知が届いた / O として読む", async () => {
    const k = notificationKit();
    const O = await k.person("o");
    await k.operators(O);
    const T1 = await k.person("t1");
    const Q = k.place("店舗Q");
    await k.appoint(Q, T1);
    await k.withdraw(T1);
    const Ap = k.applicationId();
    await k.consume(
      k.event(
        ApplicationEvents.lapsed(
          Ap,
          { kind: "place", placeId: Q.id },
          k.tick(),
        ),
      ),
    );
    const [item] = (await list(k, O.actor)).items;
    expect(item).toMatchObject({
      occurrence: { to: "applicant", applicationId: Ap, matter: "lapsed" },
      delivery: "proxy",
      vacantTarget: Q,
      pointedContent: null,
      destination: {
        kind: "proxyOperation",
        target: Q,
        direct: { kind: "ownApplication", applicationId: Ap },
      },
    });
    // No application kind is registered before S2B, so Ap cannot be read
    // and its label is `null`; its kind and subject names are the todo below.
    expect(item?.labels).toEqual([
      { ref: Q, label: "店舗Q" },
      { ref: { kind: "application", id: Ap }, label: null },
    ]);
  });
  // S2B: the application label's kind and subject names (row 8's last part).
  it.todo(
    "row 8 of listNotifications: the labels carry Ap's kind and its subjects' names (S2B)",
  );
  it.todo(
    "listNotifications#9 利用者 A の店舗の登録申請 Ap が否認され、A に通知が届いた。店舗は作られていない / A として読む",
  );
  it.todo(
    "listNotifications#10 利用者 A の登録申請 Ap1 が承認されて店舗が作られ、その後に店舗の名称が変更された / A として読む",
  );
  it.todo(
    "listNotifications#11 利用者 A の掲載の申請 Ap が承認され、A に通知が届いた / A として読む",
  );

  it("listNotifications#12 地域運営者が不在の地域 RV への所属申請 Ap が提出され、サービス運営者 O に通知が届いた / O として読む", async () => {
    const k = notificationKit();
    const O = await k.person("o");
    await k.operators(O);
    const RV = k.region("地域RV");
    const Ap = k.applicationId();
    await k.consume(
      k.event(
        ApplicationEvents.submitted(
          Ap,
          { kind: "steward", target: RV },
          k.tick(),
        ),
      ),
    );
    const [item] = (await list(k, O.actor)).items;
    expect(item).toMatchObject({
      occurrence: { to: "approver", applicationId: Ap, matter: "submitted" },
      delivery: "proxy",
      vacantTarget: RV,
      pointedContent: null,
      destination: { kind: "applicationReview", applicationId: Ap },
    });
  });

  it("listNotifications#13 サービス運営者が A の店舗 P の管理権限を解除し、A に通知が届いた / A として読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    const P = k.place("店舗P");
    await k.consume(
      k.event(
        AuthorityEvents.stewardRemoved(P, A.accountId, "revoked", k.tick()),
      ),
    );
    const [item] = (await list(k, A.actor)).items;
    expect(item).toMatchObject({
      occurrence: { to: "self", revoked: { kind: "stewardship", target: P } },
      pointedContent: P,
      labels: [{ ref: P, label: "店舗P" }],
      destination: null,
    });
  });

  it("listNotifications#14 S1 が、アカウントを持つ利用者 A のメールアドレスを店舗 P の管理メンバーに招待し（招待 I）、A に通知が届いた / A として読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    const P = k.place("店舗P");
    const I = k.invitationId();
    await k.consume(
      k.event(AuthorityEvents.invitationIssued(P, I, A.email, k.tick())),
    );
    const [item] = (await list(k, A.actor)).items;
    expect(item).toMatchObject({
      occurrence: { to: "invitee", email: A.email, target: P, invitationId: I },
      pointedContent: P,
      labels: [{ ref: P, label: "店舗P" }],
      destination: { kind: "invitation", target: P, invitationId: I },
    });
  });

  // S3 (region exclusion). Keeping a notification after its recipient
  // resigned is covered below with a stage-1 event.
  it.todo(
    "listNotifications#15 店舗 P が地域 R から除外された通知を A が受けた後、A が店舗 P の店舗管理者を辞任した / A として読む",
  );
  // S5: an article's showcase.
  it.todo(
    "listNotifications#16 公開中の読みもの A1 が紹介する掲載 L が削除され、編集担当者 E に通知が届いた / E として読む",
  );
  // S2: takedown claims; categories.
  it.todo(
    "listNotifications#17 店舗 P への取り下げの申立て Cl が受け付けられ、サービス運営者 O に通知が届いた。その後、P が非公開になった / O として読む",
  );
  it.todo(
    "listNotifications#18 カテゴリー K が移行先をカテゴリー K2 として廃止され、K を保存している掲載を持つ店舗 P の店舗管理者 A に通知が届いた / A として読む",
  );
  it.todo(
    "listNotifications#19 上の通知が届いた後、カテゴリー K2 の名称が変更された / A として読む",
  );
  it.todo(
    "listNotifications#20 その後、カテゴリー K2 が移行先をカテゴリー K3 として廃止された / A として読む",
  );

  it("listNotifications#21 管理権限の申請の承認で S3 が店舗 P の店舗管理者に加わり、A に通知が届いた / A として読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    const S3 = await k.person("s3");
    const P = await stewardAddedTo(k, A, S3);
    const [item] = (await list(k, A.actor)).items;
    expect(item).toMatchObject({
      occurrence: {
        to: "placeStewards",
        subject: { matter: { kind: "steward_added", appointee: S3.accountId } },
      },
      labels: [
        { ref: P, label: "店舗P" },
        { ref: { kind: "account", id: S3.accountId }, label: S3.email },
      ],
      destination: { kind: "placeManagement", placeId: P.id, facet: "members" },
    });
  });

  it("listNotifications#22 利用者 A の通知が、1ページの件数より多い / 1ページ目と2ページ目を読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    for (let i = 0; i < 5; i += 1) {
      await k.consume(
        k.event(
          AuthorityEvents.stewardRemoved(
            k.place(`店舗${i}`),
            A.accountId,
            "revoked",
            k.tick(),
          ),
        ),
      );
    }
    const first = await list(k, A.actor, { page: 1, limit: 3 });
    const second = await list(k, A.actor, { page: 2, limit: 3 });
    expect([first.count, second.count]).toEqual([5, 5]);
    const all = [...first.items, ...second.items];
    expect(all).toHaveLength(5);
    expect(new Set(all.map((item) => item.id)).size).toBe(5);
    const times = all.map((item) => item.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("listNotifications#23 メールが届かなかった通知（Mailer.send が失敗した） / 宛先の利用者として読む", async () => {
    const k = notificationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const P = k.place("店舗P");
    k.mailer.failWhen((mail) => mail.to === A.email);
    await k
      .consume(
        k.event(
          AuthorityEvents.stewardRemoved(P, A.accountId, "revoked", k.tick()),
        ),
      )
      .catch(() => undefined);
    k.mailer.failWhen(null);
    await k.consume(
      k.event(
        AuthorityEvents.stewardRemoved(P, B.accountId, "revoked", k.tick()),
      ),
    );
    expect(k.mailsTo(A)).toEqual([]);
    expect(k.mailsTo(B)).toHaveLength(1);
    const [failed] = (await list(k, A.actor)).items;
    const [sent] = (await list(k, B.actor)).items;
    const { id: _a, createdAt: _at, ...failedView } = failed ?? {};
    const { id: _b, createdAt: _bt, ...sentView } = sent ?? {};
    expect(failedView).toEqual(sentView);
  });
});

describe("listNotifications with stage-1 events", () => {
  it("lists every authority's and role's notifications in one newest-first list", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    const S3 = await k.person("s3");
    await stewardAddedTo(k, A, S3);
    await k.consume(
      k.event(
        ApplicationEvents.submitted(
          k.applicationId(),
          { kind: "steward", target: k.region("地域R") },
          k.tick(),
        ),
      ),
    );
    await k.consume(
      k.event(AuthorityEvents.roleGranted("editor", A.accountId, k.tick())),
    );
    await k.consume(
      k.event(
        ApplicationEvents.approved(
          k.applicationId(),
          { kind: "individual", accountId: A.accountId },
          k.tick(),
        ),
      ),
    );
    const R = k.region("地域R2");
    await k.appoint(R, A);
    await k.consume(
      k.event(
        ApplicationEvents.submitted(
          k.applicationId(),
          { kind: "steward", target: R },
          k.tick(),
        ),
      ),
    );
    const result = await list(k, A.actor);
    expect(result.items.map((item) => item.occurrence.to)).toEqual([
      "approver",
      "applicant",
      "grantee",
      "placeStewards",
    ]);
    expect(result.count).toBe(4);
  });

  it("returns the reader's notifications only, counting the reader's", async () => {
    const k = notificationKit();
    const [A, B, S3] = [
      await k.person("a"),
      await k.person("b"),
      await k.person("s3"),
    ];
    const P = k.place("店舗P");
    await k.appoint(P, A, B, S3);
    await k.consume(
      k.event(
        AuthorityEvents.stewardAppointed(
          P,
          S3.accountId,
          "application",
          k.tick(),
        ),
      ),
    );
    await k.consume(
      k.event(AuthorityEvents.roleGranted("editor", B.accountId, k.tick())),
    );
    const mine = await list(k, A.actor);
    expect(mine.count).toBe(1);
    expect((await list(k, B.actor)).count).toBe(2);
  });

  it("keeps a notification after its recipient resigned", async () => {
    const k = notificationKit();
    const [A, S3] = [await k.person("a"), await k.person("s3")];
    const P = await stewardAddedTo(k, A, S3);
    const before = await list(k, A.actor);
    await k.removeSteward(P, A);
    expect(await list(k, A.actor)).toEqual(before);
  });
});
