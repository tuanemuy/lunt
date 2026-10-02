# ADR（アーキテクチャの判断の記録）

spec の層に書かない、実装の構成と方式の判断を記録する。業務の規則は spec の各層が持ち、ここは参照する。

| ADR | 判断 |
| --- | --- |
| [0001](0001-runtime-workers-durable-objects.md) | ランタイムを Cloudflare Workers・Durable Objects・Queues に絞る |
| [0002](0002-single-global-durable-object.md) | すべての状態を1つのグローバルな Durable Object に置く |
| [0003](0003-do-rpc-and-typed-ledgers.md) | DO の RPC を問い合わせとコミットに絞り、型つきの台帳で網羅する |
| [0004](0004-commit-conditions-for-access.md) | 確定の時点の権限をコミットの条件で確かめる |
| [0005](0005-event-delivery.md) | ドメインイベントを消費者ごとに配送し、成功の後に受領を記録する |
| [0006](0006-daily-jobs.md) | 日次ジョブを Cron で起動し、1件の失敗で止めない |
| [0007](0007-session-and-login.md) | セッションとログインの秘密を署名と要約で扱う |
| [0008](0008-dev-tools.md) | 開発用の道具を開発の構成と localhost だけで有効にする |
| [0009](0009-mail-and-external-login.md) | メールと外部ログインを契約検証で受け入れ、実アダプターを用意する |
| [0010](0010-area-master.md) | エリアのマスターを静的アセットとして配る |
| [0011](0011-photos.md) | 写真を R2 に置き、Worker から配る |
| [0012](0012-screens-and-loading.md) | 画面の殻とデザインの取り込み、読み込みの方式 |
| [0013](0013-tests.md) | テストを3層に分け、spec のテストケースに名前で対応づける |
| [0014](0014-errors-and-http-status.md) | 業務エラーを共通の状態と HTTP 状態に型で対応づける |
| [0015](0015-map.md) | 地図を MapLibre と公開ベクトルタイルで描く |
| [0016](0016-feed-reads.md) | フィードの候補を ID だけで読み、深さに上限を置く |
| [0017](0017-stored-search-text.md) | キーワード検索を保存済みの正規化文字列で判定する |
| [0018](0018-device-bookmarks.md) | 端末の保存をブラウザに置き、ログインで合流する |
| [0019](0019-screen-urls.md) | 画面と URL の対応 |
