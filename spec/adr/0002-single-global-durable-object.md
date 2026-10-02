# ADR 0002: すべての状態を1つのグローバルな Durable Object に置く

- 状態: 採用

## 背景

UnitOfWork はドメインをまたぐ集約（申請の承認と反映先、退会と管理権限・役割など）を原子的に書く契約を持つ。Discovery・ApplicationReviewDesk・ContentDirectory はドメインをまたいで読む（`spec/domains/index.md`「UnitOfWork ポート」「読み取り」）。

## 決定

- すべての集約・Outbox・消費者の受領記録・DLQ の記録を、1つのグローバルな SQLite-backed Durable Object（`LuntStateObject`）に置く
- 退けた案: 集約ごと・テナントごとの DO 分割。原子性とドメインをまたぐ読み取りを満たせない

## 結果

- 1つの `transactionSync` で原子的に書け、またぐ読み取りを1つの SQLite で行える
- 書き込みと読み取りはすべて1つの DO を通るので、重い読み取りは DO を止める。フィード・検索・地図は読み取りの形と索引で抑える（ADR 0015・0016）
