import { describe, it } from "vitest";

// S3B: the leave kind and Region land in stage 3.
describe("approveLeave", () => {
  it.todo(
    "approveLeave#1 利用者 R は地域 X の運営者。店舗 p1 は X と Y に所属中。p1 について店舗管理者として行った X からの離脱の申請 b1 が確認中 / R が、確かめたときの版を添えて b1 を承認する",
  );
  it.todo(
    "approveLeave#2 店舗 p1 は X（先に所属）と Y に所属中で、選んだ代表地域は X / R が、p1 の X からの離脱の申請を承認する",
  );
  it.todo(
    "approveLeave#3 店舗 p1 は公開されていて営業中。p1 の掲載 l1 は公開中で提供中、l2 は一時非公開。b1 が確認中 / R が b1 を承認する",
  );
  it.todo(
    "approveLeave#4 店舗 p1 は X と Y に所属中。p1 の X からの離脱の申請 b1 と、Y からの離脱の申請 b2 が確認中 / R が b1 を承認する",
  );
  it.todo(
    "approveLeave#5 利用者 A が個人として行った、管理者のいない店舗 p2 の X からの離脱の申請 b3 が確認中 / R が b3 を承認する",
  );
  it.todo(
    "approveLeave#6 地域 Y に運営者がいない。Y からの離脱の申請 b4 が確認中。操作する人はサービス運営者 O / O が b4 を承認する",
  );
  it.todo(
    "approveLeave#7 地域 X に運営者がいる。b1 は10日前から確認中。O は X の運営者でない / O が b1 を承認する",
  );
  it.todo(
    "approveLeave#8 地域 Y に運営者がいない。Y からの離脱の申請 b7 は10日前から確認中。サービス運営者 O が不在の代行で b7 を確かめた後、承認の前に利用者 R が Y の運営者に就いた / O が b7 を1回承認する",
  );
  it.todo(
    "approveLeave#9 地域 Z は公開を取り下げられている。p1 について店舗管理者として行った Z からの離脱の申請 b5 が確認中。利用者 Q は Z の運営者 / Q が b5 を承認する",
  );
  it.todo(
    "approveLeave#10 b1 の確認中に、R が p1 を X から除外した。前提の再評価はまだ届いていない / R が b1 を承認する",
  );
  it.todo(
    "approveLeave#11 p2 の X からの離脱の申請が、A のもの（b3）と利用者 B のもの（b6）、どちらも確認中。R が b3 を承認した。b6 の前提の再評価はまだ届いていない / R が b6 を承認する",
  );
  it.todo(
    "approveLeave#12 利用者 U は X の運営者でも、サービス運営者でもない / U が b1 を承認する",
  );
  it.todo(
    "approveLeave#13 b1 は、判断の前に取り下げられた / R が b1 を承認する",
  );
  it.todo(
    "approveLeave#14 b1 は、R が確かめた後に、別の運営者が差し戻し、店舗管理者が再提出して確認中に戻った / R が、古い版を添えて b1 を承認する",
  );
});
