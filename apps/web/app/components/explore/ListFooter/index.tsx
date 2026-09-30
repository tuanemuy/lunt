"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextButton } from "@/components/ui/TextButton";
import type { PagedList } from "../usePagedList";

type ListFooterProps = {
  list: PagedList<unknown>;
  /** CS-01 while the next page loads, e.g. 続きを読み込んでいます. */
  loadingText: string;
  /** The skeleton of the next rows, shaped like them. */
  loadingShape: ReactNode;
  /** CF-05's end, e.g. イベントはここまでです. */
  endText: string;
};

/**
 * The end of a paged list (CF-05): 「続きを読み込む」 (also loaded as it
 * comes into view), the next rows' skeleton while they load, CS-02 with a
 * retry that keeps what was loaded, and the end once everything is shown.
 */
export function ListFooter({
  list,
  loadingText,
  loadingShape,
  endText,
}: ListFooterProps) {
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
        <p className="loading__text">{loadingText}</p>
        {loadingShape}
      </div>
    );
  }
  if (list.hasMore) {
    return (
      <div ref={list.sentinel}>
        <Button variant="secondary" fit onClick={list.loadMore}>
          続きを読み込む
        </Button>
      </div>
    );
  }
  return <p className="list-end">{endText}</p>;
}
