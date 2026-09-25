# AreaCatalog

`AreaCatalog` は読み取り専用で、書き込みのメソッドを持たない。前提条件のマスターの内容は、テスト用の実装にも本番の実装にも、組み立てるときの読み込み元として次の「テスト用のマスター」を与える（[../../domains/area.md](../../domains/area.md)「AreaCatalog」）。UnitOfWork に参加しないので、UnitOfWork の中での振る舞いのケースは持たない。

## テスト用のマスター

実在の郵便番号データと一致しなくてよい、並び順と対応の確認のための内容。

| 町域 | `areaCode` | 都道府県 | 市区町村 | `name` | `kana` |
|---|---|---|---|---|---|
| T1 | 1000000 | 13 東京都 | 13101 千代田区 | （空。市区町村の全域） | （空） |
| T2 | 1000004 | 13 東京都 | 13101 千代田区 | 大手町 | オオテマチ |
| T3 | 1000001 | 13 東京都 | 13101 千代田区 | 千代田 | チヨダ |
| T4 | 1040061 | 13 東京都 | 13102 中央区 | 銀座 | ギンザ |
| T5 | 5300001 | 27 大阪府 | 27127 大阪市北区 | 梅田 | ウメダ |
| T6 | 9990001 | 27 大阪府 | 27127 大阪市北区 | 甲町 | コウマチ |
| T7 | 9990001 | 27 大阪府 | 27127 大阪市北区 | 乙町 | オツマチ |
| T8 | 9990003 | 27 大阪府 | 27127 大阪市北区 | みどり | ミドリ |
| T9 | 9990002 | 27 大阪府 | 27127 大阪市北区 | みどり東 | ミドリ |
| T10 | 9990002 | 27 大阪府 | 27127 大阪市北区 | あさひ | ミドリ |

マスターにないもの: 郵便番号 1008111（事業所固有の郵便番号）、都道府県 47、市区町村 13103、市区町村 47201。

## ケース

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| テスト用のマスター | `listPrefectures()` | 13 東京都、27 大阪府を、この順（`code` の昇順）で返す。町域を持たない都道府県（47）は現れない | |
| テスト用のマスター | `listMunicipalities("13")` | 13101 千代田区、13102 中央区を、この順（`code` の昇順）で返す。どちらも `prefectureCode` は 13。大阪府の市区町村は含まれない | |
| テスト用のマスター | `listMunicipalities("27")` | 27127 大阪市北区の1件を返す | |
| テスト用のマスター | `listMunicipalities("47")`（マスターにない都道府県） | 空の結果を返す。エラーにならない | |
| テスト用のマスター | `listTowns("13101")` | T1、T2、T3 を、この順で返す（`name` が空の町域が先頭、以降は `kana` の昇順）。市区町村の全域を指す町域 T1 を含む。各町域の `prefecture` は 13 東京都、`municipality` は 13101 千代田区 | |
| テスト用のマスター | `listTowns("27127")` | T5、T7、T6、T10、T9、T8 を、この順で返す（`kana` の昇順。同じ `kana` の T10・T9・T8 は `areaCode` の昇順、同じ `areaCode` の T10・T9 は `name` の昇順。昇順は Unicode のコードポイント順）。同じ `areaCode` を持つ T6 と T7 が、別の町域として両方現れる | |
| テスト用のマスター | `listTowns("13102")` | T4 の1件を返す。他の市区町村の町域は含まれない | |
| テスト用のマスター | `listTowns("13103")`（マスターにない市区町村） | 空の結果を返す。エラーにならない | |
| テスト用のマスター | `findTownsByPostalCode("1040061")` | T4 の1件を返す。`areaCode` は 1040061 | |
| テスト用のマスター | `findTownsByPostalCode("9990001")`（複数の町域が対応する郵便番号） | T7、T6 を、この順（`listTowns` と同じ並び順）で返す | |
| テスト用のマスター | `findTownsByPostalCode("1000000")`（市区町村の全域を指す郵便番号） | T1 の1件を返す。`name` は空 | |
| テスト用のマスター | `findTownsByPostalCode("1008111")`（事業所固有の郵便番号） | 空の結果を返す。エラーにならない | |
| テスト用のマスター | `findTownsByPostalCode("0000000")`（どの町域にも対応しない郵便番号） | 空の結果を返す。エラーにならない | |
| テスト用のマスター | `findTown({ areaCode: "9990001", municipalityCode: "27127", name: "甲町" })` | T6 を返す（同じ `areaCode` の T7 ではない） | |
| テスト用のマスター | `findTown({ areaCode: "1000000", municipalityCode: "13101", name: "" })` | T1 を返す | |
| テスト用のマスター | `findTown({ areaCode: "9990001", municipalityCode: "27127", name: "丙町" })`（`name` だけが一致しない） | `null` を返す | |
| テスト用のマスター | `findTown({ areaCode: "1040061", municipalityCode: "13101", name: "銀座" })`（`municipalityCode` だけが一致しない） | `null` を返す | |
| テスト用のマスター | `findTown({ areaCode: "1000004", municipalityCode: "13101", name: "千代田" })`（`areaCode` だけが一致しない） | `null` を返す | |
| テスト用のマスター | `expand([])` | 空の集合を返す | |
| テスト用のマスター | `expand([{ unit: "prefecture", prefectureCode: "13" }])` | `{1000000, 1000004, 1000001, 1040061}` を返す | |
| テスト用のマスター | `expand([{ unit: "municipality", municipalityCode: "27127" }])` | `{5300001, 9990001, 9990002, 9990003}` を返す（同じ `areaCode` の町域は1つの値になる） | |
| テスト用のマスター | `expand([{ unit: "area", areaCode: "1040061" }])` | `{1040061}` を返す | |
| テスト用のマスター | `expand([{ unit: "area", areaCode: "1008111" }])`（マスターにない値） | 空の集合を返す | |
| テスト用のマスター | `expand([{ unit: "prefecture", prefectureCode: "47" }, { unit: "municipality", municipalityCode: "47201" }])`（マスターにないコード） | 空の集合を返す。エラーにならない | |
| テスト用のマスター | `expand([{ unit: "municipality", municipalityCode: "13102" }, { unit: "area", areaCode: "5300001" }])`（単位の異なる選択） | `{1040061, 5300001}`（和集合）を返す | |
| テスト用のマスター | `expand([{ unit: "prefecture", prefectureCode: "13" }, { unit: "area", areaCode: "1000004" }])`（広い単位の選択に含まれる狭い単位の選択） | `expand([{ unit: "prefecture", prefectureCode: "13" }])` と同じ集合を返す | |
| テスト用のマスター | `labelSelections([])` | 空の列を返す | |
| テスト用のマスター | `labelSelections([{ unit: "prefecture", prefectureCode: "13" }])` | `label` が都道府県名「東京都」の1件を返す | |
| テスト用のマスター | `labelSelections([{ unit: "municipality", municipalityCode: "13101" }])` | `label` が都道府県名「東京都」と市区町村名「千代田区」からなる1件を返す | |
| テスト用のマスター | `labelSelections([{ unit: "area", areaCode: "1040061" }])` | `label` が郵便番号 1040061 と、T4 の地名（東京都・中央区・銀座）からなる1件を返す | |
| テスト用のマスター | `labelSelections([{ unit: "area", areaCode: "9990001" }])`（同じエリアに複数の町域） | `label` の地名は、`listTowns` の並び順で最初の町域 T7（乙町）の地名 | |
| テスト用のマスター | `labelSelections([{ unit: "area", areaCode: "9990002" }])`（同じエリアに、同じ `kana` の町域が複数） | `label` の地名は、`name` の昇順で先の町域 T10（あさひ）の地名 | |
| テスト用のマスター | `labelSelections([{ unit: "area", areaCode: "1000000" }])`（`name` が空の町域のエリア） | `label` の地名は、都道府県名と市区町村名だけ | |
| テスト用のマスター | `labelSelections([{ unit: "area", areaCode: "5300001" }, { unit: "prefecture", prefectureCode: "13" }, { unit: "municipality", municipalityCode: "27127" }])` | 3件を、引数と同じ順で返す。各件の `selection` は引数の選択と等価 | |
| テスト用のマスター | `labelSelections([{ unit: "prefecture", prefectureCode: "13" }, { unit: "area", areaCode: "1008111" }, { unit: "municipality", municipalityCode: "47201" }])`（マスターにないコードを含む） | 都道府県 13 の1件だけを返す。マスターにないコードの選択は結果から除かれる | |
| テスト用のマスター | 同じ引数で `listTowns("27127")` を2回呼ぶ | 2回とも同じ内容を同じ順で返す（マスターの内容は1つの要求の中で変わらない） | |
