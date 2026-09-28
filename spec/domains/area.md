# Area

町域の郵便番号を単位とするエリアと、都道府県・市区町村・町域の階層を提供する。エリアのデータは日本郵便の郵便番号データに由来する読み取り専用のマスターで、Lunt の利用者の操作では変わらない。

共有カーネルの `AreaCode`・`Address` を使う（[index.md](index.md)）。他のドメインに依存しない。

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Area | エリア | 町域の郵便番号1つが表す範囲。識別子は `AreaCode`。絞り込みと、店舗・地域・イベントの所在地の単位（P-12） |
| PostalCode | 郵便番号 | 利用者が入力する7桁の郵便番号。町域の郵便番号とは限らない |
| Prefecture | 都道府県 | 階層の1段目 |
| Municipality | 市区町村 | 階層の2段目。1つの都道府県に属する |
| Town | 町域 | 階層の3段目。1つの市区町村に属し、1つのエリアに対応する。郵便番号と対応する地名で示す |
| AreaSelection | エリアの選択 | 都道府県・市区町村・エリアのいずれかの単位での選択。都道府県または市区町村の選択は、含まれるすべてのエリアの選択として扱う（P-13） |
| AreaCatalog | エリアのマスター | 階層と町域を引く読み取り専用のマスター |

- 事業所固有の郵便番号はエリアにならず、マスターに含まれない。`AreaCode` は7桁の形式だけを表し、エリアとしてマスターにあるかどうかは `AreaCatalog` が答える
- 市区町村の全域を指す郵便番号（郵便番号データの「以下に掲載がない場合」）も、町域として扱う。この町域は固有の地名を持たず、地名は市区町村名だけで示す
- 「以下に掲載がない場合」の行を持たず、`〇〇村一円` の1行だけを持つ市区町村は、その行を市区町村の全域の町域として扱う
- ビルの階ごとの郵便番号（`（ｎ階）`・`（地階・階層不明）`）は町域の郵便番号で、町域として残す
- 町域の地名は、郵便番号データの地名から、地名の範囲を補う括弧書きの注記（`（次のビルを除く）`・`（その他）`・`（丁目）`・`（番地）`・番地や地区の列挙など）を除いた名前とする（例: `丸の内（次のビルを除く）` は `丸の内`）。ビルの階の括弧書き（`（ｎ階）`・`（地階・階層不明）`）は、同じビルの町域を区別するので残す。複数の行に分かれた地名は1つにつなげてから注記を除く
- 郵便番号・市区町村・地名が同じで読みだけが違う行は、郵便番号データの先の行だけを採る
- 1つのエリアに複数の町域が対応することがある。同じ `AreaCode` を持つ町域は同じエリアに属し、町域を選ぶことは、その `AreaCode` のエリアを選ぶことに当たる
- 所在地のエリアは `Address.areaCode` で決まる。店舗・地域・イベントの所在地が選択エリアにあるかどうかは、「`Address.areaCode` が、選択を展開した `AreaCode` の集合に含まれる」で判定する。Area は選択の展開（`AreaCatalog.expand`）までを担い、対象の集約に対する判定は、その集合を受け取る側（Discovery の問い合わせ）が行う。V-16 の「地域の位置が選択エリアにある」は、地域の `Address.areaCode` に対するこの判定を指す

## エンティティ

なし。都道府県・市区町村・町域は、Lunt の中で生成・変更・削除されず、ライフサイクルと振る舞いを持たない。コードで識別される値オブジェクトとして扱う。

## 値オブジェクト

### PostalCode

```ts
type PostalCode = string & { readonly [postalCodeBrand]: true };
```

- `PostalCode.create(input: string): PostalCode`。全角の数字を半角にし、ハイフンと空白を取り除いた結果が7桁の数字でなければ `BusinessRuleError`（`AREA_INVALID_POSTAL_CODE`）
- 等価性: 値の一致
- `PostalCode` から、マスターにある町域の `AreaCode` を得る経路は、`AreaCatalog.findTownsByPostalCode` が返す `Town.areaCode` だけ

### AreaCode

共有カーネルの型と、それを作る `AreaCode.create`（[index.md](index.md)「値の生成」）。

- マスターにあるかどうかは `AreaCatalog` が答える。マスターにない `AreaCode` は、`findTown` では `null`、`expand` では集合に入らず、`labelSelections` では結果から除かれる
- 利用者が選んだ値（`AreaSelection` のエリア、`TownRef`）を受け取るときに使う。利用者が入力した郵便番号は `PostalCode.create` で受ける

### PrefectureCode / MunicipalityCode

```ts
type PrefectureCode = string & { readonly [prefectureCodeBrand]: true };     // 都道府県コード。2桁の数字（"01"〜"47"）
type MunicipalityCode = string & { readonly [municipalityCodeBrand]: true }; // 全国地方公共団体コード。5桁の数字
```

- `PrefectureCode.create(input: string)`: `"01"`〜`"47"` でなければ `BusinessRuleError`（`AREA_INVALID_PREFECTURE_CODE`）
- `MunicipalityCode.create(input: string)`: 5桁の数字で、先頭2桁が `PrefectureCode` として成り立たなければ `BusinessRuleError`（`AREA_INVALID_MUNICIPALITY_CODE`）
- `MunicipalityCode.prefectureOf(code: MunicipalityCode): PrefectureCode`: 先頭2桁を返す
- 等価性: 値の一致

### Prefecture / Municipality / Town

```ts
type Prefecture = Readonly<{ code: PrefectureCode; name: string }>;

type Municipality = Readonly<{
  code: MunicipalityCode;
  prefectureCode: PrefectureCode;
  name: string;
}>;

type Town = Readonly<{
  areaCode: AreaCode;
  prefecture: Prefecture;
  municipality: Municipality;
  name: string; // 町域の地名。市区町村の全域を指す町域では空
  kana: string; // 町域の読み。並び順に使う
}>;
```

- `AreaCatalog` だけが返す。利用者の入力から組み立てない
- 等価性: `Prefecture` と `Municipality` は `code` の一致。`Town` は `areaCode`・`municipality.code`・`name` の一致
- `Town.toAddress(town: Town, rest: string): Address`: `areaCode`・`prefecture.name`・`municipality.name`・`name` と、前後の空白を取り除いた `rest` から `Address` を作る。`Address` を作る経路はこの関数だけで、`Address` に入る `AreaCode` は `AreaCatalog` に存在する値に限られる。`rest` は空でもよい
- `Town.label(town: Town): string`: 郵便番号と対応する地名（都道府県・市区町村・町域）を併せた表示名を返す。`name` が空の町域では、地名は都道府県と市区町村だけになる
- `name` が空の町域は、1つの市区町村に1つまで。この町域から作った `Address` の `town` は空で、`rest` に市区町村より後の部分が入る

### TownRef

```ts
type TownRef = Readonly<{
  areaCode: AreaCode;
  municipalityCode: MunicipalityCode;
  name: string;
}>;
```

利用者が選んだ町域を指す。`Town` の等価性と同じ3つの値で町域を特定する。`areaCode` は `AreaCode.create`、`municipalityCode` は `MunicipalityCode.create` を通した値で組み立てる。`AreaCatalog.findTown` で `Town` に解決できない `TownRef` からは、所在地を作れない。解決できない `TownRef` を受け取ったユースケースは `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`）にする。

### AreaSelection

```ts
type AreaSelection =
  | Readonly<{ unit: "prefecture"; prefectureCode: PrefectureCode }>
  | Readonly<{ unit: "municipality"; municipalityCode: MunicipalityCode }>
  | Readonly<{ unit: "area"; areaCode: AreaCode }>;
```

- 等価性: `unit` とコードの一致
- `AreaSelection.dedupe(selections: readonly AreaSelection[]): readonly AreaSelection[]`: 等価な選択を1つにまとめる。順序は初出の順
- 単位の異なる選択を併せて持てる。複数の選択は、展開した `AreaCode` の集合の和として扱う。広い単位の選択に含まれる狭い単位の選択が併せてあっても、結果は変わらない
- 選択が空の列は「エリアの条件なし」を表し、展開しない（すべての対象が条件に合う）。この区別は、選択を使う側（Discovery）が行う

### AreaSelectionLabel

```ts
type AreaSelectionLabel = Readonly<{ selection: AreaSelection; label: string }>;
```

選択中の条件の表示に使う。`label` は、都道府県の選択では都道府県名、市区町村の選択では都道府県名と市区町村名、エリアの選択では郵便番号と対応する地名（同じエリアの町域が複数あれば、`AreaCatalog.listTowns` の並び順で最初の町域の地名）。

## ドメインサービス

なし。選択の展開はマスターの読み取りで、`AreaCatalog` が担う。

## ドメインイベント

なし。

## ポート

### AreaCatalog

目的: エリアのマスターを読む。階層をたどる、郵便番号から町域の候補を引く、エリアの選択を `AreaCode` の集合に展開する。

```ts
interface AreaCatalog {
  listPrefectures(): Promise<readonly Prefecture[]>;
  listMunicipalities(prefectureCode: PrefectureCode): Promise<readonly Municipality[]>;
  listTowns(municipalityCode: MunicipalityCode): Promise<readonly Town[]>;
  findTownsByPostalCode(postalCode: PostalCode): Promise<readonly Town[]>;
  findTown(ref: TownRef): Promise<Town | null>;
  expand(selections: readonly AreaSelection[]): Promise<ReadonlySet<AreaCode>>;
  labelSelections(selections: readonly AreaSelection[]): Promise<readonly AreaSelectionLabel[]>;
}
```

共通の契約:

- 読み取り専用。書き込みのメソッドを持たず、UnitOfWork に参加しない。マスターの内容は、1つの要求の中で変わらない
- マスターの内容は、アダプターを組み立てるときに読み込み元として与える（本番は郵便番号データから作ったマスター、ポート適合テストは「テスト用のマスター」）。ポートはマスターを差し替えるメソッドを持たない
- マスターは、町域の郵便番号とその都道府県・市区町村・町域だけを持つ。事業所固有の郵便番号を持たない
- 1つの町域は、ちょうど1つの市区町村と1つの `AreaCode` に対応する。1つの市区町村は、ちょうど1つの都道府県に属する。町域を1つも持たない市区町村と都道府県は、マスターに現れない
- 存在しないコードは、エラーではなく空の結果になる
- ページングを持たない。どの結果も、マスターの階層の1段分で件数が限られる

メソッドごとの契約:

| メソッド | 振る舞い | 並び順 |
| --- | --- | --- |
| `listPrefectures` | すべての都道府県を返す | `code` の昇順 |
| `listMunicipalities` | その都道府県に属するすべての市区町村を返す。存在しない都道府県では空 | `code` の昇順 |
| `listTowns` | その市区町村に属するすべての町域を返す。市区町村の全域を指す町域を含む。存在しない市区町村では空 | `name` が空の町域を先頭に、以降は `kana` の昇順。同順位は `areaCode` の昇順、次に `name` の昇順。`kana` と `name` の昇順は、文字列の Unicode のコードポイント順 |
| `findTownsByPostalCode` | その郵便番号を `AreaCode` に持つすべての町域を返す。町域に対応しない郵便番号（事業所固有の郵便番号を含む）では空。空の結果は、呼び出し側のユースケース（`findTownsByPostalCode`）が `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`）にする | `listTowns` と同じ |
| `findTown` | `TownRef` の3つの値がすべて一致する町域を返す。なければ `null` | — |
| `expand` | 選択ごとに、都道府県の選択はその都道府県のすべての町域の `AreaCode`、市区町村の選択はその市区町村のすべての町域の `AreaCode`、エリアの選択はその `AreaCode`（マスターにある場合だけ）を集め、和集合を返す。空の列では空の集合 | — |
| `labelSelections` | 選択ごとの表示名を、引数と同じ順で返す。マスターにないコードの選択は結果から除く | 引数の順 |

## トランザクション境界

Area は書き込みを持たない。原子的に確定する範囲はない。

所在地を持つ集約（店舗、地域、イベント）と、所在地を内容に持つ申請を書き込むユースケースは、UnitOfWork を始める前に `AreaCatalog.findTown` で町域を解決し、`Town.toAddress` で `Address` を作る。`findTown` が `null` を返せば `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`）にし、書き込まない。

## ユースケース（概要）

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `browseAreaHierarchy` | 都道府県、都道府県の市区町村、市区町村の町域を順に読む。絞り込みのエリアの選択と、所在地の町域の選択に使う | DIS-03、DIS-04、SHP-03、SHP-06、SHP-08、SHP-12、SHP-13、REG-06、REG-12、EVT-04、EVT-12 |
| `findTownsByPostalCode` | 入力された郵便番号に対応する町域を読む。候補がなければ `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`）にする | SHP-03、SHP-06、SHP-08、SHP-12、SHP-13、REG-06、REG-12、EVT-04、EVT-12 |
| `labelAreaSelections` | 選択中のエリアの条件を、表示名とともに読む | DIS-04 |

エリアの選択による絞り込みそのもの（DIS-03、EXP-01〜EXP-03）は Discovery のユースケースで、`AreaCatalog.expand` の結果を条件に使う。
