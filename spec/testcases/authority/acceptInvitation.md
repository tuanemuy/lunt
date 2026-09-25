# acceptInvitation

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P の管理者は A。C のメールアドレス宛ての承諾前の招待がある | C を `Actor` として承諾する | 成功する。C が `since = now` で P の管理者に加わり、管理者は A、C の順になる。承諾した招待は承諾前の招待から消える。`"authority.steward_appointed"`（`target` は P、`accountId` は C、`via: "invitation"`）が1件出る（AC-23） | |
| 上のケースの後 | C を `Actor` として、P に `viewMembers` と `inviteMember` を実行する | どちらも成功する。招待で管理者になった C は、A と同じ操作を行える（AC-23） | |
| 店舗 P に C 宛ての承諾前の招待がある。`AccountRepository.findById` で C の `expectedVersion` V を得ている | C を `Actor` として承諾した後、V で `AccountRepository.delete(C)` を実行する | 承諾は成功し、C のアカウントの版が進む。V での `delete` は `ConflictError`。承諾の後に C が `withdraw` を実行すると成功し、P の管理者から C が消える | |
| 地域 R は管理者不在で、C 宛ての承諾前の招待が残っている | C を `Actor` として承諾する | 成功する。R は C を管理者に持つ `stewarded` になる。`"authority.steward_appointed"` が出る | |
| 店舗 P に C 宛ての承諾前の招待がある。招待した管理者 A は、その後に退会している。P には別の管理者 B がいる | C を `Actor` として承諾する | 成功する。招待した管理者の退会は招待を無効にしない | |
| 店舗 P に、あるメールアドレス宛ての招待が、そのメールアドレスのアカウントがない時点で作られている。その後、そのメールアドレスでのログインでアカウント C が作られた | C を `Actor` として承諾する | 成功する。C が P の管理者になる | |
| C は店舗 P1 の管理者。店舗 P2 に C 宛ての承諾前の招待がある | C を `Actor` として P2 の招待を承諾し、`getMyAuthority` を実行する | 承諾は成功する。管理する対象として P1 と P2 を返す。P1 の管理体制は変わらない（AC-37） | |
| 店舗 P に、C 宛てと D 宛ての承諾前の招待がある | C を `Actor` として承諾する | C 宛ての招待だけが消える。D 宛ての招待は残る | |
| 店舗 P に C 宛ての承諾前の招待がある。X のメールアドレスは C と異なる | X を `Actor` として、その招待を承諾する | `BusinessRuleError`（`AUTHORITY_INVITATION_EMAIL_MISMATCH`）。X は管理者にならず、招待は残る | |
| 店舗 P の C 宛ての招待が取り消されている | C を `Actor` として承諾する | `BusinessRuleError`（`AUTHORITY_INVITATION_NOT_FOUND`）。C は管理者にならない | |
| C は店舗 P の管理者になっている | C を `Actor` として、以前の招待の `InvitationId` で承諾する | `BusinessRuleError`（`AUTHORITY_ALREADY_STEWARD`）。管理体制は変わらず、ドメインイベントは出ない | |
| A は店舗 P の管理者。C 宛ての承諾前の招待がある | C の承諾と、A の取り消しを同時に実行し、取り消しが先に確定する | 承諾は `ConflictError`。C が送り直すと `AUTHORITY_INVITATION_NOT_FOUND`。C は管理者にならない | |
| 店舗 P に C 宛ての承諾前の招待がある。C の `Actor` が作られた後、C の退会がコミットした | その `Actor` で承諾する（`AccountRepository.findById(C)` が `null`） | `UnauthorizedError`。C は P の管理者にならず、承諾のドメインイベントは出ない | |
