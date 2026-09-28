import { describe, it } from "vitest";

/** Every row needs the participation kind, registered with Occasion in S3B. */
describe("submitParticipation", () => {
  it.todo(
    "submitParticipation#1 利用者 S は店舗 p1 の店舗管理者。イベント e1 は公開中で開催前、運営者がいる。p1 の掲載 l1 は公開中で提供中、l2 は公開中で提供開始前、l6 は公開中で提供終了 / S が、l1・l2・l6 と、開催期間内の参加日2日を添えて、p1 の e1 への参加を申請する",
  ); // S3B: the participation kind (Occasion)
  it.todo(
    "submitParticipation#2 S は p1 の店舗管理者。e1 は公開中で開催中 / S が、掲載も参加日も添えずに、p1 の e1 への参加を申請する",
  ); // S3B: the participation kind (Occasion)
  it.todo(
    "submitParticipation#3 p1 の e1 への参加の申請が否認になっている / S が、別の ID で p1 の e1 への参加を申請する",
  ); // S3B: the participation kind (Occasion)
  it.todo(
    "submitParticipation#4 利用者 A は p1 の店舗管理者でない。p1 に店舗管理者がいない / A が p1 の e1 への参加を申請する",
  ); // S3B: the participation kind (Occasion)
  it.todo(
    "submitParticipation#5 S は申請の入力の途中で p1 の管理権限を失った / S が p1 の e1 への参加を申請する",
  ); // S3B: the participation kind (Occasion)
  it.todo(
    "submitParticipation#6 S は p1 の店舗管理者。e1 は終了している / S が p1 の e1 への参加を申請する",
  ); // S3B: the participation kind (Occasion)
  it.todo(
    "submitParticipation#7 S は p1 の店舗管理者。e1 は中止になっている / S が p1 の e1 への参加を申請する",
  ); // S3B: the participation kind (Occasion)
  it.todo(
    "submitParticipation#8 S は p1 の店舗管理者。p1 は e1 に参加中 / S が p1 の e1 への参加を申請する",
  ); // S3B: the participation kind (Occasion)
  it.todo(
    "submitParticipation#9 p1 の別の店舗管理者 T が行った、p1 の e1 への参加の申請が差し戻し / S が p1 の e1 への参加を申請する",
  ); // S3B: the participation kind (Occasion)
  it.todo(
    "submitParticipation#10 S は p1 の店舗管理者。e1 は公開を取り下げられている / S が p1 の e1 への参加を申請する",
  ); // S3B: the participation kind (Occasion)
  it.todo(
    "submitParticipation#11 S は p1 の店舗管理者。e1 は開催前 / S が、開催期間の外の日付を参加日にして申請する",
  ); // S3B: the participation kind (Occasion)
  it.todo(
    "submitParticipation#12 S は p1 の店舗管理者。p1 の掲載 l3 は下書き、l4 は一時非公開、l5 は別の店舗の公開中の掲載 / S が、l3、l4、l5 のどれかを添えて申請する",
  ); // S3B: the participation kind (Occasion)
  it.todo(
    "submitParticipation#13 l1 と参加日を添えた、p1 の e1 への参加の申請 c1 が確認中で保存されている。その後、l1 が一時非公開になり、e1 の開催期間が短くなって参加日が期間外になった / S が、同じ ID c1 と、最初と同じ掲載と参加日で、もう一度申請する",
  ); // S3B: the participation kind (Occasion)
  it.todo(
    "submitParticipation#14 c1 が確認中で保存されている / S が、同じ ID c1 で、添える掲載の違う入力を送る",
  ); // S3B: the participation kind (Occasion)
});
