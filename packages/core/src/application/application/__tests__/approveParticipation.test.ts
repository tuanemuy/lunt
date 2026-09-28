import { describe, it } from "vitest";

// S3B: the participation kind and Occasion land in stage 3.
describe("approveParticipation", () => {
  it.todo(
    "approveParticipation#1 利用者 V はイベント e1（開催前）の運営者。店舗 p1（店舗管理者がいる）について店舗管理者として行った、掲載 l1・l2 と参加日2日を添えた e1 への参加の申請 c1 が確認中 / V が、確かめたときの版を添えて c1 を承認する",
  );
  it.todo(
    "approveParticipation#2 掲載も参加日も添えていない参加の申請 c2 が確認中 / V が c2 を承認する",
  );
  it.todo(
    "approveParticipation#3 c1 に添えた掲載 l2 が、確認中に一時非公開になった / V が c1 を承認する",
  );
  it.todo(
    "approveParticipation#4 c1 の参加日は、開催期間内の2日。確認中に e1 の開催期間が短くなり、そのうち1日が期間外になった / V が c1 を承認する",
  );
  it.todo(
    "approveParticipation#5 V は e1 の運営者で、p1 の店舗管理者でもある。V が店舗管理者として行った c1 が確認中 / V が c1 を承認する",
  );
  it.todo(
    "approveParticipation#6 イベント e2 に運営者がいない。e2 への参加の申請 c3 が確認中。操作する人はサービス運営者 O / O が c3 を承認する",
  );
  it.todo(
    "approveParticipation#7 e1 に運営者がいる。c1 は10日前から確認中。O は e1 の運営者でない / O が c1 を承認する",
  );
  it.todo(
    "approveParticipation#8 e1 に運営者がいる。c1 は3日前から確認中 / O が c1 を承認する",
  );
  it.todo(
    "approveParticipation#9 イベント e2 に運営者がいない。e2 への参加の申請 c4 は10日前から確認中。サービス運営者 O が不在の代行で c4 を確かめた後、承認の前に利用者 W が e2 の運営者に就いた / O が c4 を1回承認する",
  );
  it.todo(
    "approveParticipation#10 e2 に運営者がいない。c4 は3日前から確認中。O が不在の代行で c4 を確かめた後、承認の前に W が e2 の運営者に就いた / O が c4 を承認する",
  );
  it.todo(
    "approveParticipation#11 c1 の確認中に、e1 が中止になった。前提の再評価はまだ届いていない / V が c1 を承認する",
  );
  it.todo(
    "approveParticipation#12 c1 の確認中に、e1 の開催期間が更新されて終了になった。前提の再評価はまだ届いていない / V が c1 を承認する",
  );
  it.todo(
    "approveParticipation#13 c1 の確認中に、p1 の最後の店舗管理者が辞任して p1 は管理者不在になり、V が p1 を参加店舗として直接追加し、その後に利用者 T が p1 の店舗管理者に就いた。前提の再評価はまだ届いていない / V が c1 を承認する",
  );
  it.todo(
    "approveParticipation#14 c1 の確認中に、p1 の最後の店舗管理者が退会した。前提の再評価はまだ届いていない / V が c1 を承認する",
  );
  it.todo(
    "approveParticipation#15 c1 の確認中に、e1 が運営による非公開になった / V が c1 を承認する",
  );
  it.todo(
    "approveParticipation#16 利用者 U は e1 の運営者でも、サービス運営者でもない / U が c1 を承認する",
  );
  it.todo(
    "approveParticipation#17 c1 は、期間超過の代行をするサービス運営者が先に承認した / V が c1 を承認する",
  );
  it.todo(
    "approveParticipation#18 c1 は、V が確かめた後に、別の運営者が差し戻し、店舗管理者が掲載と参加日を直して再提出して確認中に戻った / V が、古い版を添えて c1 を承認する",
  );
});
