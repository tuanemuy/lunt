# デザイントークン

Lunt のデザイントークンを定める。値は Figma（[Lunt — Design System & App — C1](https://www.figma.com/design/myuWbMhAEM0nAbR0PTgjhh/)）の Variables・テキストスタイル・エフェクトスタイルから取り込んだ。取り込みの経緯と、Figma に無く補った値は [index.md](index.md) の「取り込み元」が定める。

各画面の HTML は、下の `:root` をそのまま `<style>` に転記して参照する。

## 命名

- Figma の Variables を持つ値は、Variables の名前の `/` を `-` にした名前を使う（`color/ink` → `--ink`、`space/21` → `--space-21`）
- Variables の無い値（テキストスタイル、エフェクトスタイル、Figma に無く補った値）は、design-flow の命名規則で名付ける
- Figma の Variables は Light モードだけを持ち、ビューポートのモードを持たない。ビューポートで変わる値（画面の左右の余白）は、Figma に無く補った値として「ビューポートで変わる値」に定め、`@media` の中の `:root` で上書きする

## カラー

Figma のコレクション `Color` は、同じ名前の `Primitives` を参照する。値は OKLCH で定め、HEX を併記する。OKLCH は、HEX に戻したときに Figma の HEX と一致する桁まで残す。

| トークン（コード名） | Figma の Variables | OKLCH | HEX | 用途 |
| --- | --- | --- | --- | --- |
| `--white` | color/surface | `oklch(99.7% 0.005 95.1)` | #FFFEFA | ページ・カードの地 |
| `--ink` | color/ink | `oklch(33.2% 0.029 167.8)` | #273B33 | 本文・見出しの文字 |
| `--secondary` | color/secondary | `oklch(45.2% 0.022 142.7)` | #4F594E | 補足の文字 |
| `--muted` | color/muted | `oklch(54.8% 0.02 140)` | #6B7469 | メタ情報・非選択のナビゲーション |
| `--line` | color/line | `oklch(91% 0.013 126.4)` | #DFE3DA | 罫線・枠線 |
| `--green` | color/accent | `oklch(43.4% 0.057 163.2)` | #315B48 | 主要な操作・選択中 |
| `--light` | color/subtle | `oklch(94.8% 0.014 134.9)` | #EAF0E7 | 選択中の地・淡い面 |
| `--paper` | color/paper | `oklch(95.8% 0.008 91.5)` | #F3F1EB | 区画の地・写真の読み込み前の地 |
| `--focus` | color/focus | `oklch(57.7% 0.13 40.7)` | #B85B38 | フォーカスリング・エラー |

## タイポグラフィ

### 書体

| トークン | 値 | 出どころ |
| --- | --- | --- |
| `--font-display` | `'Noto Serif JP', serif` | Figma のテキストスタイル Catch・Page・Section・Name |
| `--font-base` | `'Noto Sans JP', sans-serif` | Figma のテキストスタイル Body・UI・Meta・Small |

どちらも Google Fonts から読み込む（`family=Noto+Sans+JP:wght@400;500&family=Noto+Serif+JP:wght@400`）。

### テキストスタイル

Figma のテキストスタイル `Lunt/*` を、サイズ・行の高さ・字間・ウェイトのトークンに分けて持つ。字間は Figma では % で、1em に対する割合として `em` で書く（2% → `0.02em`）。

| Figma のスタイル | 書体 | サイズ | 行の高さ | 字間 | ウェイト |
| --- | --- | --- | --- | --- | --- |
| Lunt/Catch | `--font-display` | `--text-catch` 29px | `--leading-catch` 43px | `--tracking-display` 0.02em | `--weight-regular` 400 |
| Lunt/Page | `--font-display` | `--text-page` 24px | `--leading-page` 36px | `--tracking-display` | `--weight-regular` |
| Lunt/Section | `--font-display` | `--text-section` 18px | `--leading-section` 29px | `--tracking-display` | `--weight-regular` |
| Lunt/Name | `--font-display` | `--text-name` 15px | `--leading-name` 24px | `--tracking-display` | `--weight-regular` |
| Lunt/Body | `--font-base` | `--text-body` 14px | `--leading-body` 25px | `--tracking-base` 0 | `--weight-regular` |
| Lunt/UI | `--font-base` | `--text-ui` 13px | `--leading-ui` 20px | `--tracking-base` | `--weight-medium` 500 |
| Lunt/Meta | `--font-base` | `--text-meta` 11px | `--leading-meta` 18px | `--tracking-base` | `--weight-regular` |
| Lunt/Small | `--font-base` | `--text-small` 10px | `--leading-small` 16px | `--tracking-base` | `--weight-regular` |

管理側の画面は、テキストスタイルを持たない次の値を Figma のフレームで繰り返し使う（40 Merchant Screens の参照コード）。

| 用途 | 書体 | サイズ | 行の高さ | ウェイト |
| --- | --- | --- | --- | --- |
| 管理側の画面名（Title bar）・完了の見出し | `--font-base` | `--text-title` 22px | `--leading-title` 33px | `--weight-medium` |
| 管理側の区分の見出し | `--font-base` | `--text-section` 18px | `--leading-heading` 27px | `--weight-medium` |
| 管理側で対象を大きく示す名称（M05 のイベント名） | `--font-base` | `--text-lead` 20px | `--leading-lead` 30px | `--weight-medium` |

`Lunt/Doc`（Noto Sans JP Medium 32/48）は Figma の説明ページの見出し用で、画面では使わないので取り込まない。

## スペーシング

Figma の Variables `space/*`（コレクション `Layout`）。基準は 4px で、画面の左右の余白だけが 21px。

| トークン | 値 | 主な用途（Figma の Foundations） |
| --- | --- | --- |
| `--space-0` | 0 | |
| `--space-4` | 4px | |
| `--space-8` | 8px | |
| `--space-12` | 12px | |
| `--space-16` | 16px | カード間 |
| `--space-21` | 21px | 画面の左右 |
| `--space-24` | 24px | |
| `--space-32` | 32px | |
| `--space-48` | 48px | |

### ビューポートで変わる値

| トークン | 〜767px | `md` 768px〜 | 出どころ |
| --- | --- | --- | --- |
| `--space-gutter` | `var(--space-21)` | `var(--space-32)` | 〜767px は Figma の Foundations の「画面の左右21」。768px〜は補った（[index.md](index.md) の「レスポンシブ戦略」） |

## 角丸

Figma の Variables `radius/*`。

| トークン | 値 | 主な用途 |
| --- | --- | --- |
| `--radius-0` | 0 | |
| `--radius-2` | 2px | 写真 |
| `--radius-8` | 8px | |
| `--radius-16` | 16px | |
| `--radius-999` | 999px | 丸い操作・チップ |

## サイズ

| トークン | 値 | 出どころ |
| --- | --- | --- |
| `--size-touch` | 44px | Figma の Variables `size/touch`。操作の最小の大きさ |
| `--bottom-nav-height` | 77px | Figma の BottomNavigation の高さ。モバイルで下端に固定したナビゲーションに本文が隠れない余白に使う |

## 線の太さ

| トークン | 値 | 出どころ |
| --- | --- | --- |
| `--border-1` | 1px | Figma の罫線・枠線（Button Secondary・IconButton・Chip・Input などの枠） |
| `--border-2` | 2px | Figma の Input の State=Focus の枠。フォーカスのリングにも使う |

アイコンと地図の線（1.65px など）は SVG の中の値で、トークンにしない。

## 影

| トークン | 値 | 出どころ |
| --- | --- | --- |
| `--color-green-hover` | `color-mix(in oklch, var(--green), var(--ink) 45%)` | 補った。Button Primary のホバー（Figma はホバーのバリアントを持たない）。`--green` と Pressed の `--ink` の間 |
| `--color-scrim` | `oklch(33.2% 0.029 167.8 / 0.4)` | 補った。確定の確認（CS-12）などの重なる面の背景。`--ink` の 40% |
| `--shadow-overlay` | `0 8px 24px oklch(33.2% 0.029 167.8 / 0.12)` | Figma のエフェクトスタイル `Lunt/Overlay`（DROP_SHADOW x0 y8 blur24 spread0、#273B33 12%） |

## トランジション

Figma はトランジションを持たない。design-flow の規則で補った（[index.md](index.md) の「補ったもの」）。

| トークン | 値 |
| --- | --- |
| `--transition-default` | `150ms ease-out` |

## ブレークポイント

design-flow の標準値。メディアクエリには数値を直接書く。

| 名前 | 最小幅 | メディアクエリ |
| --- | --- | --- |
| (base) | 0 | （未指定） |
| `sm` | 640px | `@media (min-width: 640px)` |
| `md` | 768px | `@media (min-width: 768px)` |
| `lg` | 1024px | `@media (min-width: 1024px)` |
| `xl` | 1280px | `@media (min-width: 1280px)` |
| `2xl` | 1536px | `@media (min-width: 1536px)` |

## CSS カスタムプロパティ

```css
:root {
  /* カラー（Figma Variables: Color → Primitives, Light） */
  --white: oklch(99.7% 0.005 95.1);   /* #FFFEFA */
  --ink: oklch(33.2% 0.029 167.8);      /* #273B33 */
  --secondary: oklch(45.2% 0.022 142.7); /* #4F594E */
  --muted: oklch(54.8% 0.02 140);       /* #6B7469 */
  --line: oklch(91% 0.013 126.4);       /* #DFE3DA */
  --green: oklch(43.4% 0.057 163.2);   /* #315B48 */
  --light: oklch(94.8% 0.014 134.9);   /* #EAF0E7 */
  --paper: oklch(95.8% 0.008 91.5);     /* #F3F1EB */
  --focus: oklch(57.7% 0.13 40.7);      /* #B85B38 */

  /* 書体 */
  --font-display: 'Noto Serif JP', serif;
  --font-base: 'Noto Sans JP', sans-serif;

  /* テキストスタイル（Figma: Lunt/*） */
  --text-catch: 29px;   --leading-catch: 43px;
  --text-page: 24px;    --leading-page: 36px;
  --text-section: 18px; --leading-section: 29px;
  --text-name: 15px;    --leading-name: 24px;
  --text-body: 14px;    --leading-body: 25px;
  --text-ui: 13px;      --leading-ui: 20px;
  --text-meta: 11px;    --leading-meta: 18px;
  --text-small: 10px;   --leading-small: 16px;
  --text-title: 22px;   --leading-title: 33px;
  --leading-heading: 27px;
  --text-lead: 20px;    --leading-lead: 30px;
  --tracking-display: 0.02em;
  --tracking-base: 0;
  --weight-regular: 400;
  --weight-medium: 500;

  /* スペーシング（Figma Variables: space/*） */
  --space-0: 0;
  --space-4: 4px;
  --space-8: 8px;
  --space-12: 12px;
  --space-16: 16px;
  --space-21: 21px;
  --space-24: 24px;
  --space-32: 32px;
  --space-48: 48px;
  --space-gutter: var(--space-21); /* 画面の左右の余白。md で上書き */

  /* 角丸（Figma Variables: radius/*） */
  --radius-0: 0;
  --radius-2: 2px;
  --radius-8: 8px;
  --radius-16: 16px;
  --radius-999: 999px;

  /* サイズ（Figma Variables: size/touch） */
  --size-touch: 44px;
  --bottom-nav-height: 77px;

  /* 線 */
  --border-1: 1px;
  --border-2: 2px;

  /* 重なる面の背景（補ったもの） */
  --color-scrim: oklch(33.2% 0.029 167.8 / 0.4);
  --color-green-hover: color-mix(in oklch, var(--green), var(--ink) 45%);

  /* 影（Figma: Lunt/Overlay） */
  --shadow-overlay: 0 8px 24px oklch(33.2% 0.029 167.8 / 0.12);

  /* トランジション（補ったもの） */
  --transition-default: 150ms ease-out;

  /* ブレークポイント（参照用） */
  --bp-sm: 640px;
  --bp-md: 768px;
  --bp-lg: 1024px;
  --bp-xl: 1280px;
  --bp-2xl: 1536px;
}

@media (min-width: 768px) {
  :root { --space-gutter: var(--space-32); }
}
```
