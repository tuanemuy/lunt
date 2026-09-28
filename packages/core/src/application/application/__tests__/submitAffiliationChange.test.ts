import { describe, it } from "vitest";

/** Every row needs the affiliation and leave kinds, registered with Region in S3B. */
describe("submitAffiliationChange", () => {
  it.todo(
    "submitAffiliationChange#1 利用者 S は店舗 p1 の店舗管理者。地域 X は公開中で、運営者がいる。p1 は X に所属していない / S が、店舗管理者として、p1 の X への所属を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#2 S は p1 の店舗管理者。p1 は X に所属中 / S が、店舗管理者として、p1 の X からの離脱を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#3 S は p1 の店舗管理者。p1 は Y に所属中で、X には所属していない / S が、p1 の X への所属を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#4 S は p1 の店舗管理者。p1 は、公開を取り下げた地域 Z に所属中 / S が、店舗管理者として、p1 の Z からの離脱を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#5 店舗 p2 に店舗管理者がいない。利用者 A がログインしている。地域 X は公開中 / A が、個人として、p2 の X への所属を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#6 店舗 p2 に店舗管理者がいない。p2 は X に所属中 / A が、個人として、p2 の X からの離脱を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#7 店舗 p2 に店舗管理者がいない。利用者 B が個人として行った、p2 の X への所属の申請が確認中 / A が、個人として、p2 の X への所属を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#8 店舗 p1 に店舗管理者 S がいる。A は p1 の店舗管理者でない / A が、個人として、p1 の X への所属を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#9 A は p1 の店舗管理者でない / A が、店舗管理者として、p1 の X への所属を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#10 S は申請の入力の途中で p1 の管理権限を解除された / S が、店舗管理者として、p1 の X への所属を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#11 サービス運営者 O は、管理者のいない店舗 p2 の店舗管理者でない / O が、店舗管理者として、p2 の X への所属を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#12 S は p1 の店舗管理者。p1 は X に所属中 / S が p1 の X への所属を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#13 S は p1 の店舗管理者。p1 と X の所属は、除外で解除されている / S が p1 の X からの離脱を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#14 p1 の別の店舗管理者 T が店舗管理者として行った、p1 の X への所属の申請が確認中 / S が、店舗管理者として、p1 の X への所属を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#15 S は p1 の店舗管理者。地域 X は、運営による非公開になっている / S が p1 の X への所属を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#16 店舗 p2 に店舗管理者がいない。p2 はサービス運営者が非公開にしている / A が、個人として、p2 の X への所属を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
  it.todo(
    "submitAffiliationChange#17 店舗 p2 に店舗管理者がいない。p2 は、公開を取り下げた地域 Z に所属中 / A が、個人として、p2 の Z からの離脱を申請する",
  ); // S3B: the affiliation and leave kinds (Region)
});
