"use client";

import { useNavigate, useSearch } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Chip, RemovableChip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextButton } from "@/components/ui/TextButton";
import { browseAreaFn } from "@/presentation/area";
import {
  areaSelectionOfCode,
  browseSearchOf,
  type FilterOrigin,
} from "@/presentation/browseSearch";
import type { ChosenArea, FilterScreen } from "@/presentation/discoverView";
import type { AreaOption, TownOption } from "@/presentation/placeView";
import { ExploreLinks } from "../ExploreLinks";

type Load<T> =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; items: readonly T[] }>
  | Readonly<{ status: "failed" }>;

/** Where VW-02 stands: choosing, or following the area hierarchy (都道府県 → 市区町村 → 町域). */
type Step =
  | Readonly<{ kind: "select" }>
  | Readonly<{ kind: "prefectures" }>
  | Readonly<{
      kind: "municipalities";
      prefecture: AreaOption;
      load: Load<AreaOption>;
    }>
  | Readonly<{
      kind: "towns";
      prefecture: AreaOption;
      municipality: AreaOption;
      load: Load<TownOption>;
    }>;

const ORIGIN_PATH = {
  discover: "/",
  map: "/map",
  regions: "/regions",
} as const satisfies Readonly<Record<FilterOrigin, string>>;

const postalText = (areaCode: string): string =>
  `〒${areaCode.slice(0, 3)}-${areaCode.slice(3)}`;

/** The screen that opened VW-02, with the chosen conditions in its URL. */
function returnHref(
  from: FilterOrigin,
  areas: readonly ChosenArea[],
  categoryIds: readonly string[],
): string {
  const { area, cat } = browseSearchOf({
    areas: areas.flatMap(({ code }) => {
      const selection = areaSelectionOfCode(code);
      return selection === null ? [] : [selection];
    }),
    categoryIds,
  });
  const params = new URLSearchParams();
  if (area !== undefined) params.set("area", area);
  if (cat !== undefined) params.set("cat", cat);
  const query = params.toString();
  return query === "" ? ORIGIN_PATH[from] : `${ORIGIN_PATH[from]}?${query}`;
}

function ChosenAreas({
  areas,
  onRemove,
}: {
  areas: readonly ChosenArea[];
  onRemove: (code: string) => void;
}) {
  if (areas.length === 0) return null;
  return (
    <ul className="filter__areas" aria-label="選んだエリア">
      {areas.map((area) => (
        <li key={area.code}>
          <RemovableChip
            removeLabel={`エリア「${area.label}」を外す`}
            onClick={() => onRemove(area.code)}
          >
            {area.label}
          </RemovableChip>
        </li>
      ))}
    </ul>
  );
}

/** A row that goes one level down (市区町村 / 町域). */
function DrillRow({
  name,
  meta,
  onOpen,
}: {
  name: string;
  meta?: string;
  onOpen: () => void;
}) {
  return (
    <li>
      <button type="button" className="area-row" onClick={onOpen}>
        <span className="area-row__body">
          <span className="area-row__name">{name}</span>
          {meta === undefined ? null : (
            <span className="area-row__meta">{meta}</span>
          )}
        </span>
        <Icon name="chevron" />
      </button>
    </li>
  );
}

/** A row that chooses an area (the whole of a unit, or a town): 選ぶ / 選択中. */
function ToggleRow({
  name,
  meta,
  chosen,
  onToggle,
}: {
  name: string;
  meta: string;
  chosen: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="area-row area-row--toggle"
        aria-pressed={chosen}
        onClick={onToggle}
      >
        <span className="area-row__body">
          <span className="area-row__name">{name}</span>
          <span className="area-row__meta">{meta}</span>
        </span>
        <span className="area-row__check">{chosen ? "選択中" : "選ぶ"}</span>
      </button>
    </li>
  );
}

function LevelLoading() {
  return (
    <div className="loading" role="status">
      <p className="loading__text">エリアを読み込んでいます</p>
      <Skeleton className="filter__skeleton--button" />
      <Skeleton className="filter__skeleton--button" />
    </div>
  );
}

/** CS-02 while following the hierarchy: what was chosen stays. */
function LevelFailed({
  chosen,
  onRetry,
}: {
  chosen: readonly ChosenArea[];
  onRetry: () => void;
}) {
  const kept =
    chosen.length === 0
      ? ""
      : `選びかけのエリア（${chosen.map(({ label }) => label).join("、")}）はそのままです。`;
  return (
    <Notice
      tone="error"
      title="エリアを読み込めませんでした"
      actions={
        <>
          <TextButton onClick={onRetry}>もう一度読み込む</TextButton>
          <ExploreLinks to={["search", "saved"]} />
        </>
      }
    >
      {`通信状況を確認して、もう一度お試しください。${kept}`}
    </Notice>
  );
}

/**
 * VW-02 絞り込み: starts from the conditions in force, lets the viewer add,
 * remove and change areas (any level of the hierarchy, several at once)
 * and categories, and applies them to the screen that opened it — which
 * the URL's `from` names. Nothing changes until 「この条件で見る」; the
 * header's 戻る leaves without applying (取りやめ).
 */
export function FilterPanel({ screen }: { screen: FilterScreen }) {
  const navigate = useNavigate();
  const { from } = useSearch({ from: "/_viewer/filter" });
  const [areas, setAreas] = useState<readonly ChosenArea[]>(screen.areas);
  const [categoryIds, setCategoryIds] = useState<readonly string[]>(
    screen.categoryIds,
  );
  const [step, setStep] = useState<Step>({ kind: "select" });
  const [, startLoading] = useTransition();
  const request = useRef(0);
  const top = useRef<HTMLDivElement>(null);

  // Each step replaces the body: show it from its top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per step
  useLayoutEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [step.kind]);

  const chosen = (code: string) => areas.some((area) => area.code === code);
  const toggleArea = (area: ChosenArea) =>
    setAreas((current) =>
      current.some(({ code }) => code === area.code)
        ? current.filter(({ code }) => code !== area.code)
        : [...current, area],
    );
  const removeArea = (code: string) =>
    setAreas((current) => current.filter((area) => area.code !== code));
  const toggleCategory = (id: string) =>
    setCategoryIds((current) =>
      current.includes(id)
        ? current.filter((each) => each !== id)
        : [...current, id],
    );

  const openMunicipalities = (prefecture: AreaOption) => {
    const current = ++request.current;
    setStep({
      kind: "municipalities",
      prefecture,
      load: { status: "loading" },
    });
    startLoading(async () => {
      let load: Load<AreaOption>;
      try {
        const result = await browseAreaFn({
          data: { level: "municipalities", prefectureCode: prefecture.code },
        });
        load = {
          status: "ready",
          items: result.level === "municipalities" ? result.items : [],
        };
      } catch {
        load = { status: "failed" };
      }
      if (current === request.current) {
        setStep({ kind: "municipalities", prefecture, load });
      }
    });
  };

  const openTowns = (prefecture: AreaOption, municipality: AreaOption) => {
    const current = ++request.current;
    setStep({
      kind: "towns",
      prefecture,
      municipality,
      load: { status: "loading" },
    });
    startLoading(async () => {
      let load: Load<TownOption>;
      try {
        const result = await browseAreaFn({
          data: { level: "towns", municipalityCode: municipality.code },
        });
        load = {
          status: "ready",
          items: result.level === "towns" ? result.items : [],
        };
      } catch {
        load = { status: "failed" };
      }
      if (current === request.current) {
        setStep({ kind: "towns", prefecture, municipality, load });
      }
    });
  };

  const backToSelect = () => {
    request.current++;
    setStep({ kind: "select" });
  };

  const apply = () => {
    void navigate({
      href: returnHref(from, areas, categoryIds),
      replace: true,
    });
  };

  if (step.kind === "select") {
    return (
      <div className="container filter" ref={top}>
        <h1 className="sr-only">絞り込み</h1>
        <form
          className="filter__group"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <h2 className="filter__heading">エリア</h2>
          {areas.length === 0 ? (
            <Button
              variant="secondary"
              onClick={() => setStep({ kind: "prefectures" })}
            >
              すべてのエリア
            </Button>
          ) : (
            <>
              <ChosenAreas areas={areas} onRemove={removeArea} />
              <Button
                variant="secondary"
                onClick={() => setStep({ kind: "prefectures" })}
              >
                エリアを追加・変更
              </Button>
            </>
          )}
          <hr className="filter__divider" />
          <h2 className="filter__heading">ジャンル</h2>
          {screen.categories.length === 0 ? (
            <p className="filter__none">選べるジャンルはまだありません。</p>
          ) : (
            <fieldset
              className="filter__genres"
              aria-label="ジャンル（複数選べます）"
            >
              {screen.categories.map((category) => (
                <Chip
                  key={category.id}
                  selected={categoryIds.includes(category.id)}
                  onClick={() => toggleCategory(category.id)}
                >
                  {category.name}
                </Chip>
              ))}
            </fieldset>
          )}
          <Button type="submit">この条件で見る</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setAreas([]);
              setCategoryIds([]);
            }}
          >
            条件をクリア
          </Button>
        </form>
      </div>
    );
  }

  const crumbs = (
    <nav className="crumbs" aria-label="たどったエリア">
      {step.kind === "prefectures" ? (
        <span className="crumbs__current" aria-current="location">
          すべて
        </span>
      ) : (
        <>
          <TextButton onClick={() => setStep({ kind: "prefectures" })}>
            すべて
          </TextButton>
          <span className="crumbs__sep" aria-hidden="true">
            /
          </span>
          {step.kind === "municipalities" ? (
            <span className="crumbs__current" aria-current="location">
              {step.prefecture.name}
            </span>
          ) : (
            <>
              <TextButton onClick={() => openMunicipalities(step.prefecture)}>
                {step.prefecture.name}
              </TextButton>
              <span className="crumbs__sep" aria-hidden="true">
                /
              </span>
              <span className="crumbs__current" aria-current="location">
                {step.municipality.name}
              </span>
            </>
          )}
        </>
      )}
    </nav>
  );

  const retry = () => {
    if (step.kind === "municipalities") openMunicipalities(step.prefecture);
    if (step.kind === "towns") openTowns(step.prefecture, step.municipality);
  };

  return (
    <div className="container filter" ref={top}>
      <h1 className="sr-only">絞り込み</h1>
      <section className="filter__group" aria-labelledby="filter-area-heading">
        <h2 className="filter__heading" id="filter-area-heading">
          どのあたりを眺めますか。
        </h2>
        {areas.length === 0 ? null : (
          <Button
            variant="secondary"
            onClick={() => {
              setAreas([]);
              backToSelect();
            }}
          >
            すべてのエリア
          </Button>
        )}
        {crumbs}
        {step.kind === "prefectures" ? (
          <ul className="area-list">
            {screen.prefectures.map((prefecture) => (
              <DrillRow
                key={prefecture.code}
                name={prefecture.name}
                onOpen={() => openMunicipalities(prefecture)}
              />
            ))}
          </ul>
        ) : step.load.status === "loading" ? (
          <LevelLoading />
        ) : step.load.status === "failed" ? (
          <LevelFailed chosen={areas} onRetry={retry} />
        ) : step.kind === "municipalities" ? (
          <ul className="area-list">
            <ToggleRow
              name={`${step.prefecture.name}の全体`}
              meta="含まれるすべてのエリア"
              chosen={chosen(step.prefecture.code)}
              onToggle={() =>
                toggleArea({
                  code: step.prefecture.code,
                  label: step.prefecture.name,
                })
              }
            />
            {step.load.items.map((municipality) => (
              <DrillRow
                key={municipality.code}
                name={municipality.name}
                onOpen={() => openTowns(step.prefecture, municipality)}
              />
            ))}
          </ul>
        ) : (
          <TownRows
            prefecture={step.prefecture}
            municipality={step.municipality}
            towns={step.load.items}
            chosen={chosen}
            onToggle={toggleArea}
          />
        )}
        <ChosenAreas areas={areas} onRemove={removeArea} />
        <Button onClick={backToSelect}>選んだエリアで戻る</Button>
      </section>
    </div>
  );
}

/** A municipality's towns with their postal codes; 全体 first. A code shared by several towns is one area. */
function TownRows({
  prefecture,
  municipality,
  towns,
  chosen,
  onToggle,
}: {
  prefecture: AreaOption;
  municipality: AreaOption;
  towns: readonly TownOption[];
  chosen: (code: string) => boolean;
  onToggle: (area: ChosenArea) => void;
}) {
  const labelOf = new Map<string, string>();
  for (const town of towns) {
    if (!labelOf.has(town.areaCode)) labelOf.set(town.areaCode, town.label);
  }
  return (
    <ul className="area-list">
      <ToggleRow
        name={`${municipality.name}の全体`}
        meta="含まれるすべての町域"
        chosen={chosen(municipality.code)}
        onToggle={() =>
          onToggle({
            code: municipality.code,
            label: `${prefecture.name}${municipality.name}`,
          })
        }
      />
      {towns.map((town) => (
        <ToggleRow
          key={`${town.areaCode}|${town.name}`}
          name={town.name === "" ? "（町域の指定なし）" : town.name}
          meta={postalText(town.areaCode)}
          chosen={chosen(town.areaCode)}
          onToggle={() =>
            onToggle({
              code: town.areaCode,
              label: labelOf.get(town.areaCode) ?? town.label,
            })
          }
        />
      ))}
    </ul>
  );
}
