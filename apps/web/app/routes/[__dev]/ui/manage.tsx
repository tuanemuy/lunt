import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import {
  DoneScreen,
  ManageBackLink,
  ManageBody,
  ManageHeading,
  ManageNav,
  ManageNavItem,
  ManagePage,
  ManageSection,
  ManageShell,
  ManageStatus,
  ManageTitle,
  ProxyBanner,
  StaticTarget,
  TargetSwitcher,
  TargetSwitcherItem,
  TargetSwitcherRule,
} from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/ChipButton";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CountTab, CountTabs } from "@/components/ui/CountTabs";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FactList } from "@/components/ui/FactList";
import {
  Field,
  Fieldset,
  Input,
  Select,
  Textarea,
} from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import {
  LinkList,
  ListRow,
  ListRowLink,
  Row,
  RowLink,
  Rows,
} from "@/components/ui/Rows";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextLink } from "@/components/ui/TextButton";
import { requireDevTools } from "@/presentation/devTools";

const LAYOUTS = ["nav", "proxy", "solo", "done"] as const;
type Layout = (typeof LAYOUTS)[number];

const TABS = ["home", "listings", "events", "info"] as const;
type NavTab = (typeof TABS)[number];

const searchSchema = z.object({
  layout: z.enum(LAYOUTS).optional().catch(undefined),
  tab: z.enum(TABS).optional().catch(undefined),
});

export const Route = createFileRoute("/__dev/ui/manage")({
  validateSearch: searchSchema,
  beforeLoad: () => requireDevTools(),
  head: () => ({ meta: [{ title: "UI gallery（管理側） — Lunt" }] }),
  component: ManageGallery,
});

const SELF = "/__dev/ui/manage";

const BUSINESS = [
  { value: "open", label: "営業中" },
  { value: "paused", label: "休業" },
  { value: "closed", label: "閉店" },
] as const;
type Business = (typeof BUSINESS)[number]["value"];

function businessLabel(value: Business | null): string {
  return BUSINESS.find((choice) => choice.value === value)?.label ?? "";
}

const NAV_ITEMS: ReadonlyArray<{ tab: NavTab; label: string }> = [
  { tab: "home", label: "ホーム" },
  { tab: "listings", label: "掲載" },
  { tab: "events", label: "イベント" },
  { tab: "info", label: "店舗情報" },
];

function LayoutSwitch({ layout }: { layout: Layout }) {
  const labels: Record<Layout, string> = {
    nav: "ナビゲーションあり",
    proxy: "不在の代行中",
    solo: "ナビゲーションなし（申請）",
    done: "完了（画面全体）",
  };
  return (
    <nav aria-label="表示の切り替え" className="flex flex-wrap gap-x-8">
      {LAYOUTS.map((value) => (
        <TextLink
          key={value}
          to={SELF}
          search={{ layout: value, tab: "home" }}
          aria-current={value === layout ? "page" : undefined}
        >
          {labels[value]}
        </TextLink>
      ))}
      <TextLink to="/__dev/ui">閲覧側のギャラリー</TextLink>
    </nav>
  );
}

function StoreNav({ tab, proxy }: { tab: NavTab; proxy: boolean }) {
  return (
    <ManageNav
      label="店舗の管理"
      proxy={
        proxy ? (
          <ProxyBanner label="不在の代行中">
            <TextLink to={SELF} search={{ layout: "nav", tab }}>
              対象を探すへ戻る
            </TextLink>
          </ProxyBanner>
        ) : undefined
      }
      links={
        <>
          <TextLink to="/">閲覧者に見える店舗ページ</TextLink>
          <TextLink to={SELF} search={{ layout: "solo", tab }}>
            マイページ
          </TextLink>
        </>
      }
    >
      {NAV_ITEMS.map((item) => (
        <ManageNavItem
          key={item.tab}
          to={SELF}
          search={{ layout: proxy ? "proxy" : "nav", tab: item.tab }}
          activeOptions={{ includeSearch: true }}
          activeProps={{}}
          aria-current={item.tab === tab ? "page" : undefined}
        >
          {item.label}
        </ManageNavItem>
      ))}
    </ManageNav>
  );
}

function ManageGallery() {
  const search = Route.useSearch();
  const layout = search.layout ?? "nav";
  const tab = search.tab ?? "home";

  if (layout === "done") {
    return (
      <ManageShell context="お店の管理" homeTo={SELF}>
        <DoneScreen
          title="店舗情報を保存しました"
          actions={
            <>
              <ButtonLink to={SELF} search={{ layout: "nav", tab: "home" }}>
                店舗ホームに戻る
              </ButtonLink>
              <ButtonLink to="/__dev/ui" variant="secondary">
                店舗ページを見る
              </ButtonLink>
            </>
          }
        >
          公開中の店舗ページに変更を反映しました。
        </DoneScreen>
      </ManageShell>
    );
  }

  if (layout === "solo") {
    return (
      <ManageShell context="お店の管理" homeTo={SELF} solo>
        <ManagePage
          title={
            <ManageTitle>
              <ManageBackLink to={SELF} search={{ layout: "nav", tab: "home" }}>
                戻る
              </ManageBackLink>
              <ManageHeading>新しいお店を登録</ManageHeading>
            </ManageTitle>
          }
          actionsNote="提出していない入力があります。提出せずに画面を離れると、入力した内容は残りません。"
          actions={<Button type="submit">入力した内容を確かめる</Button>}
        >
          <ManageBody>
            <LayoutSwitch layout={layout} />
            <FormSpecimen />
          </ManageBody>
        </ManagePage>
      </ManageShell>
    );
  }

  const proxy = layout === "proxy";
  return (
    <ManageShell context="お店の管理" homeTo={SELF}>
      <ManagePage
        title={
          <ManageTitle>
            {proxy ? (
              <StaticTarget
                name="喫茶 日々"
                status="営業中 · 公開中 · 管理者のいない店舗"
              />
            ) : (
              <TargetSwitcher
                name="喫茶 日々"
                asHeading
                caption="管理する店舗"
                switchLabel="管理する店舗を切り替える"
              >
                <TargetSwitcherItem
                  to={SELF}
                  search={{ layout, tab }}
                  name="喫茶 日々"
                  status="営業中 · 公開中"
                />
                <TargetSwitcherItem
                  to={SELF}
                  search={{ layout, tab: "info" }}
                  name="うつわ 凪"
                  status="休業 · 公開中"
                />
                <TargetSwitcherRule />
                <TargetSwitcherItem
                  to="/__dev/ui"
                  name="閲覧者に見える店舗ページ"
                />
              </TargetSwitcher>
            )}
            {proxy ? <ManageHeading>店舗情報を編集</ManageHeading> : null}
          </ManageTitle>
        }
        actions={
          <>
            <Button>変更を保存</Button>
            <Button variant="secondary">下書きとして保存</Button>
          </>
        }
        nav={<StoreNav tab={tab} proxy={proxy} />}
      >
        <ManageBody>
          <LayoutSwitch layout={layout} />
          <ManageStatus>営業中 · 店舗ページ公開中</ManageStatus>
          <Notice variant="manage" tone="paper" title="この店舗は非公開です">
            サービス運営者が店舗を非公開にしています。解除されるまで、店舗と掲載は閲覧者に表示されません。
          </Notice>

          <ManageSection id="g-todo" title="対応が必要なこと">
            <Notice
              variant="manage"
              title={
                <span className="flex items-center gap-8">
                  差し戻しの申請 <Badge tone="count">2件</Badge>
                </span>
              }
            />
            <LinkList>
              <li>
                <ListRowLink
                  to={SELF}
                  search={{ layout, tab }}
                  title="所属の申請 · 白波横丁"
                  meta="差し戻し · 追加の確認に答えて再提出します"
                />
              </li>
              <li>
                <ListRowLink
                  to={SELF}
                  search={{ layout, tab }}
                  title="営業時間の誤りの連絡"
                  meta="確認依頼中 · 9月24日"
                  end={<Badge tone="alert">要対応</Badge>}
                />
              </li>
              <li>
                <ListRow title="メンバーの管理" meta="店舗管理者 2人" />
              </li>
            </LinkList>
            <TextLink to={SELF} search={{ layout, tab }}>
              この店舗の申請をすべて見る
            </TextLink>
          </ManageSection>

          <ManageSection id="g-listings" title="掲載">
            <CountTabs label="掲載の区分">
              <CountTab to={SELF} search={{ layout, tab }} count={3}>
                公開中
              </CountTab>
              <CountTab
                to={SELF}
                search={{ layout, tab: "listings" }}
                count={1}
              >
                下書き
              </CountTab>
              <CountTab to={SELF} search={{ layout, tab: "events" }} count={0}>
                非公開
              </CountTab>
              <CountTab to={SELF} search={{ layout, tab: "info" }} count={1}>
                提供終了
              </CountTab>
            </CountTabs>
            <Rows>
              <li>
                <RowLink
                  to={SELF}
                  search={{ layout, tab }}
                  photo={null}
                  name="いちじくのパフェ"
                  meta="公開中 · 提供期間 10月1日〜11月30日"
                  sub="季節のおやつ"
                />
              </li>
              <li>
                <Row
                  photo={null}
                  name="器づくり体験"
                  meta="下書き"
                  sub="体験"
                />
              </li>
            </Rows>
          </ManageSection>

          <ManageSection id="g-facts" title="申請の内容">
            <FactList
              facts={[
                { term: "申請の種類", description: "所属の申請" },
                { term: "地域", description: "白波横丁" },
                { term: "提出日", description: "9月20日" },
              ]}
            />
          </ManageSection>

          <ManageSection id="g-states" title="状態の示し方">
            <Alert
              title="保存できませんでした"
              list={
                <>
                  <li>
                    <TextLink to={SELF} search={{ layout, tab }}>
                      店舗名
                    </TextLink>
                  </li>
                  <li>
                    <TextLink to={SELF} search={{ layout, tab }}>
                      所在地（町域）
                    </TextLink>
                  </li>
                </>
              }
            >
              店舗の名称・所在地・位置は、店舗を公開するための条件です。次の項目を直してください。
            </Alert>
            <Alert
              title="店舗の状況を読み込めませんでした"
              actions={<Button variant="secondary">もう一度読み込む</Button>}
            >
              通信を確かめて、もう一度読み込んでください。
            </Alert>
            <EmptyPanel
              title="この店舗を管理する権限がありません"
              actions={<ButtonLink to="/__dev/ui">マイページへ戻る</ButtonLink>}
            >
              店舗の管理権限を持つ店舗だけを開けます。管理する店舗は、マイページから選べます。
            </EmptyPanel>
            <DonePanel
              title="営業状況を休業にしました"
              actions={
                <>
                  <Button>店舗ホームに戻る</Button>
                  <Button variant="secondary">店舗ページを見る</Button>
                </>
              }
            >
              店舗と掲載は、休業中として表示されています。
            </DonePanel>
            <div className="m-skeleton" role="status" aria-label="読み込み中">
              <Skeleton variant="manage" className="h-18 w-3/5" />
              <Skeleton variant="manage" className="h-150 w-full" />
              <Skeleton variant="manage" className="h-44 w-full rounded-8" />
              <Skeleton variant="manage" className="h-88 w-full" />
            </div>
          </ManageSection>

          <ManageSection id="g-form" title="入力">
            <FormSpecimen />
          </ManageSection>
        </ManageBody>
      </ManagePage>
    </ManageShell>
  );
}

function FormSpecimen() {
  const [business, setBusiness] = useState<Business | null>("open");
  const [confirming, setConfirming] = useState(false);
  const [applied, setApplied] = useState<Business>("open");

  return (
    <div className="m-form">
      <Field id="g-name" label="店舗名" requirement="required">
        {(control) => (
          <Input {...control} defaultValue="喫茶 日々" autoComplete="off" />
        )}
      </Field>
      <Field
        id="g-name-error"
        label="店舗名（エラー）"
        requirement="required"
        error="店舗名を入力してください。"
      >
        {(control) => <Input {...control} defaultValue="" />}
      </Field>
      <Field
        id="g-hours"
        label="営業時間"
        requirement="optional"
        help="例のように、曜日と時間を書きます。"
      >
        {(control) => (
          <Input {...control} placeholder="例: 11:00〜18:00 / 火曜定休" />
        )}
      </Field>
      <Field id="g-disabled" label="エリア（無効）">
        {(control) => (
          <Input {...control} defaultValue="緑野市・旧市街" disabled />
        )}
      </Field>
      <Field id="g-pref" label="都道府県">
        {(control) => (
          <Select {...control} defaultValue="midorino">
            <option value="">選ぶ</option>
            <option value="midorino">緑野県</option>
            <option value="shiranami">白波県</option>
          </Select>
        )}
      </Field>
      <Field id="g-intro" label="お店の紹介" requirement="optional">
        {(control) => (
          <Textarea
            {...control}
            placeholder="お店の雰囲気や、おすすめを書きます"
          />
        )}
      </Field>
      <Fieldset legend="写真" requirement="optional">
        <div className="flex flex-wrap gap-4">
          <ChipButton disabled>前へ</ChipButton>
          <ChipButton>外す</ChipButton>
        </div>
      </Fieldset>
      <ChoiceGroup
        legend="変更後の営業状況"
        name="business"
        choices={BUSINESS}
        value={business}
        onChange={setBusiness}
        help={`現在の営業状況: ${businessLabel(applied)}`}
      />
      <Button
        variant="secondary"
        disabled={business === null || business === applied}
        onClick={() => setConfirming(true)}
      >
        営業状況を変更
      </Button>
      <ConfirmDialog
        open={confirming}
        title={`${businessLabel(business)}にしますか`}
        confirmLabel={`${businessLabel(business)}にする`}
        onConfirm={() => {
          if (business !== null) setApplied(business);
          setConfirming(false);
        }}
        onCancel={() => setConfirming(false)}
      >
        <p>確定すると、すぐに閲覧者への表示が変わります。</p>
        <ul>
          <li>店舗と掲載の表示が、選んだ営業状況に変わります</li>
          <li>掲載の公開状態と提供状態は変わりません</li>
        </ul>
      </ConfirmDialog>
    </div>
  );
}
