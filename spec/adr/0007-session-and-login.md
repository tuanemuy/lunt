# ADR 0007: セッションとログインの秘密を署名と要約で扱う

- 状態: 採用

## 背景

アカウントはメールアドレスだけで識別し、パスワードを使わない（`spec/domains/account.md`）。

## 決定

- セッションは HMAC で署名した Cookie（`accountId`・発行・期限。`HttpOnly`・`Secure`・`SameSite=Lax`、30 日）。CSRF は TanStack Start の `createCsrfMiddleware`
- `Actor` は presentation の `resolveActor()` が要求ごとに1回、書き込みのない `run` で `AccountRepository.findById` を読んで作る。退会したアカウントはログインしていない扱い。ログインが必要な画面はレイアウトルートの `beforeLoad` で `/login?next=` へ送る
- ログインのリンクは 256 bit、コードは 6 桁。`SESSION_SECRET` を鍵にした HMAC の要約だけを保存する。有効期間 15 分・誤入力 5 回・送信の上限 5 通が既定値（環境変数で変える）
- メールのリンクは、開いた画面がブラウザから成立の要求を送る。GET だけでは成立させず、メールの検査器による使い切りを防ぐ
- 外部ログイン（Google OIDC）の state・nonce・PKCE は署名つき Cookie に置き、コールバックは `/login/external/google/callback`

## 結果

- サーバーにセッションの表を持たない。退会は次の要求でログインしていない扱いになる
