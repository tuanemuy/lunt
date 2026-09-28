import { describe, it } from "vitest";

// S3B: the affiliation kind and Region land in stage 3.
describe("approveAffiliation", () => {
  it.todo(
    "approveAffiliation#1 利用者 R は地域 X の運営者。店舗 p1（所属の記録がない）について店舗管理者として行った、X への所属の申請 b1 が確認中 / R が、確かめたときの版を添えて b1 を承認する",
  );
  it.todo(
    "approveAffiliation#2 店舗 p1 は地域 Y に所属中で、選んだ代表地域は Y。p1 の X への所属の申請 b1 と、地域 W への所属の申請 b2 が確認中 / R が b1 を承認する",
  );
  it.todo(
    "approveAffiliation#3 店舗 p1 は公開されていて営業中。p1 の掲載 l1 は公開中で提供中、l2 は一時非公開、l3 は下書き。b1 が確認中 / R が b1 を承認する",
  );
  it.todo(
    "approveAffiliation#4 利用者 A が個人として行った、管理者のいない店舗 p2 の X への所属の申請 b3 が確認中 / R が b3 を承認する",
  );
  it.todo(
    "approveAffiliation#5 R は地域 X の運営者で、店舗 p1 の店舗管理者でもある。R が店舗管理者として行った、p1 の X への所属の申請 b1 が確認中 / R が b1 を承認する",
  );
  it.todo(
    "approveAffiliation#6 地域 Y に運営者がいない。Y への所属の申請 b4 が確認中。操作する人はサービス運営者 O / O が b4 を承認する",
  );
  it.todo(
    "approveAffiliation#7 地域 X に運営者がいる。b1 は10日前から確認中。O は X の運営者でない / O が b1 を承認する",
  );
  it.todo(
    "approveAffiliation#8 地域 Y に運営者がいない。Y への所属の申請 b9 は3日前から確認中。サービス運営者 O が不在の代行で b9 を確かめた後、承認の前に利用者 R が Y の運営者に就いた / O が b9 を承認する",
  );
  it.todo(
    "approveAffiliation#9 地域 Y に運営者がいない。Y への所属の申請 b10 は10日前から確認中。サービス運営者 O が不在の代行で b10 を確かめた後、承認の前に利用者 R が Y の運営者に就いた / O が b10 を1回承認する",
  );
  it.todo(
    "approveAffiliation#10 地域 X に運営者がいる。b1 は3日前から確認中 / O が b1 を承認する",
  );
  it.todo(
    "approveAffiliation#11 利用者 V は地域 W の運営者で、X の運営者でない / V が b1 を承認する",
  );
  it.todo(
    "approveAffiliation#12 p2 の X への所属の申請が、A のもの（b3）と利用者 B のもの（b5）、どちらも確認中。R が b3 を承認した。b5 の前提の再評価はまだ届いていない / R が b5 を承認する",
  );
  it.todo(
    "approveAffiliation#13 b3 の確認中に、p2 に店舗管理者が就いた。前提の再評価はまだ届いていない / R が b3 を承認する",
  );
  it.todo(
    "approveAffiliation#14 b1 の確認中に、p1 の最後の店舗管理者が辞任した。前提の再評価はまだ届いていない / R が b1 を承認する",
  );
  it.todo(
    "approveAffiliation#15 b1 の確認中に、X が運営による非公開になった / R が b1 を承認する",
  );
  it.todo(
    "approveAffiliation#16 b1 は、期間超過の代行をするサービス運営者が先に否認した / R が b1 を承認する",
  );
  it.todo(
    "approveAffiliation#17 b1 は、R が確かめた後に、別の運営者が差し戻し、店舗管理者が回答を添えて再提出して確認中に戻った / R が、古い版を添えて b1 を承認する",
  );
});
