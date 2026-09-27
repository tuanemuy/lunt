import { createFileRoute, Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { z } from "zod";
import { ViewerShell } from "@/components/layout/ViewerShell";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Chip, RemovableChip } from "@/components/ui/Chip";
import { ChipButton } from "@/components/ui/ChipButton";
import { Feedback } from "@/components/ui/Feedback";
import { Icon, type IconName } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Logo } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusTag, StatusTags } from "@/components/ui/StatusTag";
import { Tab, Tabs } from "@/components/ui/Tabs";
import { TextButton, TextLink } from "@/components/ui/TextButton";
import { requireDevTools } from "@/presentation/devTools";

const searchSchema = z.object({
  header: z.enum(["home", "detail"]).optional().catch(undefined),
});

export const Route = createFileRoute("/__dev/ui/")({
  validateSearch: searchSchema,
  beforeLoad: () => requireDevTools(),
  head: () => ({ meta: [{ title: "UI gallery — Lunt" }] }),
  component: ViewerGallery,
});

const ICON_NAMES: ReadonlyArray<IconName> = [
  "back",
  "book",
  "bookmark",
  "bookmark-filled",
  "chevron",
  "close",
  "compass",
  "down",
  "filter",
  "map",
  "place",
  "region",
  "search",
];

const COLORS = [
  "white",
  "ink",
  "secondary",
  "muted",
  "line",
  "green",
  "light",
  "paper",
  "focus",
] as const;

const GENRES = ["すべて", "食べる", "買う", "体験"] as const;

function Specimen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-16 border-t border-line pt-24">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-8">{children}</div>;
}

function ViewerGallery() {
  const { header } = Route.useSearch();
  const [genre, setGenre] = useState<(typeof GENRES)[number]>("すべて");
  const [nearby, setNearby] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conditions, setConditions] = useState<ReadonlyArray<string>>([
    "食べる",
    "緑野市・旧市街",
  ]);

  return (
    <ViewerShell
      header={
        header === "detail"
          ? { type: "detail", title: "気になるもの", backTo: "/__dev/ui" }
          : { type: "home" }
      }
      current="discover"
    >
      <div className="container flex flex-col gap-24 py-21">
        <div className="flex flex-col gap-8">
          <h1 className="font-display text-page tracking-display">
            UI ギャラリー（閲覧側）
          </h1>
          <p className="text-meta text-secondary">
            閲覧側の殻（ヘッダー・本文・下部ナビゲーション）と共通の部品。
          </p>
          <Row>
            <TextLink to="/__dev/ui" search={{ header: "home" }}>
              ヘッダー: タブ画面
            </TextLink>
            <TextLink to="/__dev/ui" search={{ header: "detail" }}>
              ヘッダー: 詳細
            </TextLink>
            <TextLink to="/__dev/ui/manage">管理側のギャラリー</TextLink>
          </Row>
        </div>

        <Specimen title="書体と文字">
          <div className="flex flex-col gap-8">
            <p className="font-display text-catch tracking-display">
              喫茶と器と、小さな寄り道。
            </p>
            <p className="font-display text-page tracking-display">
              いちじくのパフェ（Page）
            </p>
            <p className="font-display text-section tracking-display">
              こもれび商店街（Section）
            </p>
            <p className="font-display text-name tracking-display">
              クロワッサン（Name）
            </p>
            <p className="text-body text-secondary">
              旬のいちじくと、香ばしいクランブル。コーヒーと一緒に、ゆっくり味わいたい一杯です。（Body）
            </p>
            <p className="text-ui font-medium">もう一度読み込む（UI）</p>
            <p className="text-meta text-secondary">喫茶 日々（Meta）</p>
            <p className="text-small text-muted">白波横丁（Small）</p>
          </div>
        </Specimen>

        <Specimen title="色">
          <ul className="grid grid-cols-3 gap-16 md:grid-cols-9">
            {COLORS.map((color) => (
              <li key={color} className="flex flex-col gap-4">
                <span
                  className="block h-48 rounded-8 border border-line"
                  style={{ background: `var(--${color})` }}
                />
                <span className="text-small text-secondary">--{color}</span>
              </li>
            ))}
          </ul>
        </Specimen>

        <Specimen title="ロゴとアイコン">
          <Row>
            <span className="text-ink">
              <Logo />
            </span>
          </Row>
          <ul className="grid grid-cols-4 gap-16 md:grid-cols-7">
            {ICON_NAMES.map((name) => (
              <li
                key={name}
                className="flex flex-col items-center gap-4 text-ink"
              >
                <Icon name={name} />
                <span className="text-small text-muted">{name}</span>
              </li>
            ))}
          </ul>
        </Specimen>

        <Specimen title="Button">
          <div className="flex flex-col gap-8">
            <Button variant="primary">この内容で参加申請</Button>
            <Button variant="secondary">イベントの一覧を見る</Button>
            <Button variant="primary" disabled>
              公開する（無効）
            </Button>
            <Button variant="secondary" disabled>
              条件を変更（無効）
            </Button>
            <ButtonLink to="/" variant="secondary" fit>
              みつけるへ（fit）
            </ButtonLink>
          </div>
        </Specimen>

        <Specimen title="TextButton・IconButton">
          <Row>
            <TextButton>すべて解除</TextButton>
            <TextLink to="/">みつけるへ</TextLink>
            <TextButton quiet>取り下げを申し立てる</TextButton>
          </Row>
          <Row>
            <IconButton icon="search" label="検索" />
            <IconButton icon="filter" label="絞り込み" neutral />
            <IconButton
              icon={saved ? "bookmark-filled" : "bookmark"}
              label="この掲載を保存"
              aria-pressed={saved}
              className={saved ? "text-green" : undefined}
              onClick={() => setSaved((value) => !value)}
            />
            <IconButton icon="back" label="戻る（無効）" neutral disabled />
          </Row>
        </Specimen>

        <Specimen title="Chip・Tabs">
          <Row>
            <Chip selected={nearby} onClick={() => setNearby((v) => !v)}>
              {nearby ? "現在地の近くから" : "現在地を使う"}
            </Chip>
            <Chip selected>選択中</Chip>
            <ChipButton>前へ</ChipButton>
            <ChipButton disabled>外す</ChipButton>
          </Row>
          <Row>
            {conditions.map((condition) => (
              <RemovableChip
                key={condition}
                removeLabel={`条件「${condition}」を解除`}
                onClick={() =>
                  setConditions((current) =>
                    current.filter((value) => value !== condition),
                  )
                }
              >
                {condition}
              </RemovableChip>
            ))}
            <TextButton
              onClick={() => setConditions(["食べる", "緑野市・旧市街"])}
            >
              元に戻す
            </TextButton>
          </Row>
          <div className="flex items-start gap-8">
            <Tabs label="ジャンル">
              {GENRES.map((value) => (
                <Tab
                  key={value}
                  selected={genre === value}
                  onClick={() => setGenre(value)}
                >
                  {value}
                </Tab>
              ))}
            </Tabs>
            <IconButton icon="filter" label="絞り込み" neutral />
          </div>
        </Specimen>

        <Specimen title="Badge・StatusTag">
          <Row>
            <Badge>確認中</Badge>
            <Badge tone="accent">公開中</Badge>
            <Badge tone="muted">下書き</Badge>
            <Badge tone="alert">差し戻し</Badge>
            <Badge tone="count">2件</Badge>
          </Row>
          <StatusTags>
            <StatusTag>提供開始前・10月1日（木）から</StatusTag>
            <StatusTag quiet>提供終了</StatusTag>
            <StatusTag quiet>お店は休業中</StatusTag>
          </StatusTags>
        </Specimen>

        <Specimen title="SectionTitle">
          <SectionTitle as="h3">この街のお店</SectionTitle>
          <SectionTitle as="h3" variant="manage">
            対応が必要なこと
          </SectionTitle>
        </Specimen>

        <Specimen title="Notice">
          <Notice
            title="現在地を利用できませんでした"
            actions={
              <>
                <TextButton>もう一度試す</TextButton>
                <TextLink to="/">エリアを選ぶ</TextLink>
              </>
            }
          >
            位置情報の利用が許可されていないか、現在地を取得できませんでした。新しい掲載から表示しています。
          </Notice>
          <Notice
            tone="error"
            title="続きを読み込めませんでした"
            actions={<TextButton>もう一度読み込む</TextButton>}
          >
            通信状況を確認して、もう一度お試しください。読み込んだ分はそのまま見られます。
          </Notice>
        </Specimen>

        <Specimen title="Feedback（空・エラー）">
          <Feedback
            kind="empty"
            title="まだ紹介できる掲載がありません。"
            body={
              <>
                ほかの探し方から、
                <br />
                お店や地域を見つけてみてください。
              </>
            }
            action={<Button variant="secondary">キーワードで探す</Button>}
            links={
              <>
                <TextButton>マップで探す</TextButton>
                <TextButton>まちから探す</TextButton>
                <TextButton>イベントを見る</TextButton>
              </>
            }
          />
          <Feedback
            kind="error"
            title="うまく読み込めませんでした。"
            body={
              <>
                通信状況を確認して、
                <br />
                もう一度お試しください。
              </>
            }
            action={<Button variant="secondary">もう一度読み込む</Button>}
          />
        </Specimen>

        <Specimen title="Skeleton">
          <div
            role="status"
            className="flex flex-col items-start gap-24"
            aria-label="閲覧側の読み込み中"
          >
            <p className="text-meta text-muted">街の景色を読み込んでいます</p>
            <Skeleton className="h-28 w-238" />
            <Skeleton className="h-28 w-304" />
            <Skeleton className="aspect-[348/193] w-full max-w-700" />
            <Skeleton className="h-18 w-150" />
            <Skeleton className="h-24 w-230" />
          </div>
          <div className="flex flex-col gap-24" aria-hidden="true">
            <Skeleton variant="manage" className="h-18 w-3/5" />
            <Skeleton variant="manage" className="h-150 w-full" />
            <Skeleton variant="manage" className="h-44 w-full rounded-8" />
          </div>
        </Specimen>

        <p className="text-meta text-muted">
          <Link to="/" className="underline">
            みつける
          </Link>
          に戻る
        </p>
      </div>
    </ViewerShell>
  );
}
