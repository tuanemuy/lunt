"use client";

import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { entryMemory } from "@/components/explore/entryMemory";
import {
  type PagedList,
  type PagedState,
  usePagedList,
} from "@/components/explore/usePagedList";
import { Button } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { Notice } from "@/components/ui/Notice";
import { Photo, type PhotoSource } from "@/components/ui/Photo";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusTag } from "@/components/ui/StatusTag";
import { TextButton } from "@/components/ui/TextButton";
import { HOLDING_STATUS_TEXT } from "@/presentation/detailView";
import { searchPageFn } from "@/presentation/discover";
import {
  closureText,
  SEARCH_KIND_LABEL,
  SEARCH_PAGE_SIZE,
  type SearchGroup,
  type SearchItem,
  type SearchScreen,
  searchItemKey,
} from "@/presentation/discoverView";
import { ExploreLinks } from "../ExploreLinks";
import { SEARCH_INPUT_ID } from "../SearchForm";

// DT-05 arrives with the article screens; a plain path until the router knows it.
const articlePath = (articleId: string): string =>
  `/articles/${encodeURIComponent(articleId)}`;

const searchMemory = entryMemory<PagedState<SearchItem>>();

type Tag = Readonly<{ text: string; quiet: boolean }>;

function Row({
  wrap,
  photo,
  name,
  meta,
  area,
  tags,
}: {
  /** The link to the result's detail, around the row's content. */
  wrap: (children: ReactNode) => ReactNode;
  photo: PhotoSource | null;
  name: string;
  meta: string | null;
  area: string | null;
  tags: readonly Tag[];
}) {
  return wrap(
    <>
      <Photo
        photo={photo}
        alt=""
        ratio={1}
        className="content-row__photo"
        emptyLabel="写真なし"
      />
      <span className="content-row__body">
        <span className="content-row__name">{name}</span>
        {meta === null ? null : (
          <span className="content-row__meta">{meta}</span>
        )}
        {area === null ? null : (
          <span className="content-row__area">{area}</span>
        )}
        {tags.map((tag) => (
          <StatusTag key={tag.text} quiet={tag.quiet}>
            {tag.text}
          </StatusTag>
        ))}
      </span>
    </>,
  );
}

const closureTag = (closure: string | null): readonly Tag[] =>
  closure === null ? [] : [{ text: closure, quiet: closure === "閉店" }];

/** A result as Lunt/ContentRow, its state told apart (the reference scene). */
function ResultRow({ item }: { item: SearchItem }) {
  switch (item.kind) {
    case "place": {
      const { place } = item;
      return (
        <Row
          wrap={(children) => (
            <Link
              className="content-row"
              to="/places/$placeId"
              params={{ placeId: place.placeId }}
            >
              {children}
            </Link>
          )}
          photo={place.photo}
          name={place.name}
          meta={place.area}
          area={place.regionName}
          tags={closureTag(closureText(place.operating))}
        />
      );
    }
    case "region": {
      const { region } = item;
      return (
        <Row
          wrap={(children) => (
            <Link
              className="content-row"
              to="/regions/$regionId"
              params={{ regionId: region.regionId }}
            >
              {children}
            </Link>
          )}
          photo={region.photo}
          name={region.name}
          meta={region.tagline}
          area={region.area}
          tags={[]}
        />
      );
    }
    case "listing": {
      const { card } = item;
      return (
        <Row
          wrap={(children) => (
            <Link
              className="content-row"
              to="/listings/$listingId"
              params={{ listingId: card.listingId }}
            >
              {children}
            </Link>
          )}
          photo={card.photo}
          name={card.name}
          meta={card.placeName}
          area={card.regionName}
          tags={[
            ...(card.state === null
              ? []
              : [{ text: card.state, quiet: card.state === "提供終了" }]),
            ...closureTag(item.closure),
          ]}
        />
      );
    }
    case "occasion": {
      const { occasion } = item;
      const holding = occasion.holding;
      return (
        <Row
          wrap={(children) => (
            <Link
              className="content-row"
              to="/events/$occasionId"
              params={{ occasionId: occasion.occasionId }}
            >
              {children}
            </Link>
          )}
          photo={occasion.photo}
          name={occasion.name}
          meta={occasion.periodText}
          area={occasion.venue}
          tags={
            holding === "ongoing"
              ? []
              : [
                  {
                    text: HOLDING_STATUS_TEXT[holding],
                    quiet: holding !== "upcoming",
                  },
                ]
          }
        />
      );
    }
    case "article": {
      const { article } = item;
      return (
        <Row
          wrap={(children) => (
            <Link className="content-row" to={articlePath(article.articleId)}>
              {children}
            </Link>
          )}
          photo={article.photo}
          name={article.title}
          meta={null}
          area={null}
          tags={[]}
        />
      );
    }
  }
}

/** CF-05 for one kind: loads as it comes into view; CS-02 keeps what was read. */
function GroupFooter({
  list,
  label,
}: {
  list: PagedList<SearchItem>;
  label: string;
}) {
  if (list.failed) {
    return (
      <Notice
        tone="error"
        title="続きを読み込めませんでした"
        actions={
          <TextButton onClick={list.loadMore}>もう一度読み込む</TextButton>
        }
      >
        通信状況を確認して、もう一度お試しください。
      </Notice>
    );
  }
  if (list.loading) {
    return (
      <div className="loading" role="status">
        <p className="loading__text">{label}の続きを読み込んでいます</p>
        <span className="search__skeleton-row">
          <Skeleton className="search__skeleton--photo" />
          <span className="search__skeleton-lines">
            <Skeleton className="search__skeleton--name" />
            <Skeleton className="search__skeleton--meta" />
          </span>
        </span>
      </div>
    );
  }
  if (list.hasMore) {
    return (
      <div ref={list.sentinel}>
        <Button variant="secondary" fit onClick={list.loadMore}>
          {label}の続きを読み込む
        </Button>
      </div>
    );
  }
  return <p className="list-end">{label}はここまでです</p>;
}

function ResultGroup({
  keyword,
  group,
}: {
  keyword: string;
  group: SearchGroup;
}) {
  const { kind } = group;
  const fetchPage = useCallback(
    (page: number) => searchPageFn({ data: { keyword, kind, page } }),
    [keyword, kind],
  );
  const list = usePagedList<SearchItem>({
    name: `search:${kind}:${keyword}`,
    first: group.first,
    pageSize: SEARCH_PAGE_SIZE,
    idOf: searchItemKey,
    fetchPage,
    memory: searchMemory,
  });
  const label = SEARCH_KIND_LABEL[kind];
  const headingId = `search-group-${kind}`;
  return (
    <section className="result-group" aria-labelledby={headingId}>
      <h2 className="section-title" id={headingId}>
        {label}
      </h2>
      <ul className="row-list">
        {list.items.map((item) => (
          <li key={searchItemKey(item)}>
            <ResultRow item={item} />
          </li>
        ))}
      </ul>
      <GroupFooter list={list} label={label} />
    </section>
  );
}

/** CS-09 (33 検索・0件): search again, or another way to explore. */
function NoResults() {
  return (
    <Feedback
      kind="empty"
      icon="search"
      title="まだ見つかりませんでした。"
      body={
        <>
          <span>別の言葉で探すか、</span>
          <span>ほかの探し方も試してみてください。</span>
        </>
      }
      action={
        <Button
          variant="secondary"
          onClick={() => {
            const input = document.getElementById(SEARCH_INPUT_ID);
            if (input instanceof HTMLInputElement) {
              input.focus();
              input.select();
            }
          }}
        >
          検索し直す
        </Button>
      }
      links={
        <ExploreLinks
          to={["discover", "map", "regions", "events", "articles"]}
        />
      }
    />
  );
}

/**
 * VW-03's results: each kind with a result in its own section (お店・まち・
 * 見つかるもの・イベント・読みもの), by relevance, each loading its rest on its own
 * (CF-05). No kind with a result is CS-09.
 */
export function SearchResults({ screen }: { screen: SearchScreen }) {
  if (screen.groups.length === 0) return <NoResults />;
  return (
    <>
      <p className="search__query">「{screen.keyword}」の検索結果</p>
      {screen.groups.map((group) => (
        <ResultGroup key={group.kind} keyword={screen.keyword} group={group} />
      ))}
    </>
  );
}
