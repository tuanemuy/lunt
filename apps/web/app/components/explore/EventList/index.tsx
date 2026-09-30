"use client";

import { Link } from "@tanstack/react-router";
import { ButtonLink } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { Photo } from "@/components/ui/Photo";
import { TextLink } from "@/components/ui/TextButton";
import { HOLDING_STATUS_TEXT } from "@/presentation/detailView";
import { listEventsFn } from "@/presentation/explore";
import {
  EVENTS_PAGE_SIZE,
  type EventItem,
  type EventsPage,
} from "@/presentation/exploreView";
import { ContentRowSkeleton } from "../ExploreSkeletons";
import { entryMemory } from "../entryMemory";
import { ListFooter } from "../ListFooter";
import { type PagedState, usePagedList } from "../usePagedList";

const pagesMemory = entryMemory<PagedState<EventItem>>();

const fetchPage = (page: number) => listEventsFn({ data: { page } });
const idOf = (item: EventItem) => item.occasionId;

/** Lunt/ContentRow of an occasion: photo, name, 開催期間, 開催場所, status → DT-04. */
function EventRow({ item }: { item: EventItem }) {
  return (
    <Link
      className="content-row"
      to="/events/$occasionId"
      params={{ occasionId: item.occasionId }}
    >
      <Photo
        photo={item.photo}
        alt=""
        ratio={1}
        className="content-row__photo"
      />
      <div className="content-row__body">
        <p className="content-row__name">{item.name}</p>
        <p className="content-row__meta">{item.periodText}</p>
        <p className="content-row__area">{item.venue}</p>
        <p className="content-row__status">
          {HOLDING_STATUS_TEXT[item.holding]}
        </p>
      </div>
    </Link>
  );
}

/**
 * VW-07 イベントの一覧 (`spec/pages/browse.md`): the upcoming and ongoing
 * occasions in 開催日の順 (period start, then end), with or without
 * participants, each with its holding status (開催予定 / 開催中), loading
 * more as the end comes into view (CF-05). No browse condition applies.
 * Without any, CS-09 「イベント未開催」 leads to other ways to explore.
 */
export function EventList({ first }: { first: EventsPage }) {
  const list = usePagedList({
    name: "events",
    first,
    pageSize: EVENTS_PAGE_SIZE,
    idOf,
    fetchPage,
    memory: pagesMemory,
  });
  if (list.items.length === 0) {
    return (
      <Feedback
        kind="empty"
        icon="region"
        title="次の催しを、お楽しみに。"
        body={
          <>
            開催が決まったイベントを、
            <br />
            ここでお知らせします。
          </>
        }
        action={
          <ButtonLink variant="secondary" to="/">
            みつけるへ
          </ButtonLink>
        }
        links={
          <>
            <TextLink to="/regions">まちを探す</TextLink>
            <TextLink to="/articles">読みものを読む</TextLink>
          </>
        }
      />
    );
  }
  return (
    <ul className="row-list">
      {list.items.map((item) => (
        <li key={item.occasionId}>
          <EventRow item={item} />
        </li>
      ))}
      <li className="row-list__footer">
        <ListFooter
          list={list}
          loadingText="続きを読み込んでいます"
          loadingShape={<ContentRowSkeleton />}
          endText="イベントはここまでです"
        />
      </li>
    </ul>
  );
}
