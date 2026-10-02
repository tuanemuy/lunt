# ADR 0009: メールと外部ログインを契約検証で受け入れ、実アダプターを用意する

- 状態: 採用

## 背景

メールの送信と Google ログインは資格情報がないと実接続できない。

## 決定

- メールは開発用受信箱のアダプター（DO の表に保存し `/__dev` で読む）で端から端まで検証する。実アダプターは SMTP（ポート 465 の暗黙の TLS、`worker-mailer`）。587 の STARTTLS は workerd で使わない
- 外部ログインは疑似提供元で検証する。実アダプターは Google OIDC（`oauth4webapi`）
- 実アダプターの契約テストは資格情報があるときだけ走る
- 選択は `MAIL_TRANSPORT`・`EXTERNAL_IDP`。SMTP が使えない場合の切り替え先は Cloudflare Email Service

## 結果

- 実接続の手順と設定は `docs/runtime_cloudflare_do.md`「Mail and external login」
