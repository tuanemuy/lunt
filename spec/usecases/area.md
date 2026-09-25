# Area のユースケース

ドメイン: Area（[../domains/area.md](../domains/area.md)）。エリアのマスターは読み取り専用で、どのユースケースも書き込みを持たない。

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| browseAreaHierarchy（エリアの階層をたどる） | 都道府県、都道府県の市区町村、市区町村の町域を1段ずつ読む | DIS-03、DIS-04、SHP-03、SHP-06、SHP-08、SHP-12、SHP-13、REG-06、REG-12、EVT-04、EVT-12 / VW-02、CF-07（SM-02、RQ-02、RM-02、EM-02） |
| findTownsByPostalCode（郵便番号から町域の候補を引く） | 入力された郵便番号に対応する町域の候補を読む。候補がなければ `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`）にする | SHP-03、SHP-06、SHP-08、SHP-12、SHP-13、REG-06、REG-12、EVT-04、EVT-12 / CF-07（SM-02、RQ-02、RM-02、EM-02） |
| labelAreaSelections（選択中のエリアの表示名を引く） | 選択中のエリアの条件を、表示名とともに読む | DIS-04 / CF-03（VW-01、VW-04、VW-05）、VW-02 |

エリアの選択による絞り込み（DIS-03）は Discovery のユースケースで、`AreaCatalog.expand` を使う。所在地を持つ集約を書き込むユースケース（店舗、地域、イベント、登録申請、情報修正の申請）は、利用者が選んだ町域（`TownRef`）を `AreaCatalog.findTown` で解決して `Town.toAddress` で `Address` を作る。解決できなければ `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`）にする。

## browseAreaHierarchy

### 概要

エリアの階層の1段分を読む。絞り込みのエリアの選択と、所在地の町域の選択が、都道府県・市区町村・町域の順に呼ぶ。どの段の結果も、その単位の全体を選ぶ選択（`AreaSelection`）と、町域の選択（`TownRef`）を組み立てられる値を持つ。

### 入出力

- 入力: 読む段。都道府県の一覧（引数なし）、都道府県コードを指定した市区町村の一覧、市区町村コードを指定した町域の一覧のどれか。`Actor` を取らない（ログインせずに行える）
- 出力: 都道府県・市区町村・町域のどれかの一覧。どの段も、その単位の選択（`AreaSelection`）と町域の選択（`TownRef`）を組み立てられ、町域は `Town.label` の表示名を持つ。市区町村の全域を指す町域を含む
- 並び順は `AreaCatalog` の契約のまま返す（都道府県と市区町村はコードの昇順、町域は `AreaCatalog.listTowns` の並び順）
- 存在しない都道府県コード・市区町村コードでは、空の一覧を返す

### 使用するドメインの振る舞い・ポート

- `PrefectureCode.create`、`MunicipalityCode.create`
- `AreaCatalog.listPrefectures`、`AreaCatalog.listMunicipalities`、`AreaCatalog.listTowns`
- `Town.label`

### トランザクション境界

UnitOfWork を使わない。`AreaCatalog` は UnitOfWork に参加しない読み取り専用のポートで、コンテナから得る。

### エラーケース

要件・シナリオが振る舞いを定めるエラーはない。マスターにないコードは、エラーではなく空の結果になる。

## findTownsByPostalCode

### 概要

入力された郵便番号に対応する町域の候補を読む。1つの郵便番号に複数の町域が対応することがあり、利用者は候補から町域を1つ選ぶ。町域に対応しない郵便番号（事業所固有の郵便番号を含む）は候補がなく、所在地は決まらない。

### 入出力

- 入力: 利用者が入力した郵便番号の文字列。全角の数字、ハイフン、空白を含んでよい（`PostalCode.create` が正規化する）。`Actor` を取らない
- 出力: 町域の候補の一覧。各候補は `browseAreaHierarchy` の町域と同じ形で、都道府県・市区町村の名称を併せ持つ。並び順は `AreaCatalog.listTowns` と同じ

### 使用するドメインの振る舞い・ポート

- `PostalCode.create`
- `AreaCatalog.findTownsByPostalCode`
- `Town.label`

### トランザクション境界

`browseAreaHierarchy` と同じ。UnitOfWork を使わず、`AreaCatalog` だけを読む。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 郵便番号が7桁の数字にならない | `BusinessRuleError`（`AREA_INVALID_POSTAL_CODE`） |
| 郵便番号に対応する町域がない（事業所固有の郵便番号を含む） | `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`）。利用者は階層から町域を選び直す |

## labelAreaSelections

### 概要

選択中のエリアの条件を、表示名とともに読む。選択は閲覧中の画面の間だけ保たれる値で、保存されない。ユースケースは、渡された選択をマスターに照らして表示名を返す。

### 入出力

- 入力: エリアの選択の列（都道府県・市区町村・エリアの単位を併せて持てる）。`Actor` を取らない
- 出力: 選択と表示名の組の列。等価な選択は1つにまとめ、初出の順で返す。マスターにないコードの選択は結果から除く。空の列では空の列を返す
- 表示名は `AreaSelectionLabel` の定義のまま返す（都道府県の選択では都道府県名、市区町村の選択では都道府県名と市区町村名、エリアの選択では郵便番号と対応する地名）

### 使用するドメインの振る舞い・ポート

- `PrefectureCode.create`、`MunicipalityCode.create`、`AreaCode.create`（選択の組み立て）
- `AreaSelection.dedupe`
- `AreaCatalog.labelSelections`

### トランザクション境界

`browseAreaHierarchy` と同じ。UnitOfWork を使わず、`AreaCatalog` だけを読む。

### エラーケース

要件・シナリオが振る舞いを定めるエラーはない。マスターにないコードの選択は、エラーではなく結果から除かれる。
