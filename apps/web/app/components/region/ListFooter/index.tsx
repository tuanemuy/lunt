"use client";

import type { Ref } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { ErrorState } from "@/presentation/errorState";

/**
 * The end of an RM list (CF-05): 「続きを読み込む」 (also loaded as it
 * comes into view), the failure of a further page with its retry, or
 * 「すべて…を表示しました」.
 */
export function ListFooter({
  hasMore,
  failure,
  loading,
  loadMore,
  sentinel,
  endText,
}: {
  hasMore: boolean;
  failure: ErrorState | null;
  loading: boolean;
  loadMore: () => void;
  sentinel: Ref<HTMLDivElement>;
  endText: string;
}) {
  if (failure !== null) {
    return (
      <div role="alert">
        <Notice
          variant="manage"
          title="続きを読み込めませんでした"
          actions={
            <Button variant="secondary" onClick={loadMore} disabled={loading}>
              もう一度読み込む
            </Button>
          }
        >
          {failure.kind === "failed"
            ? "通信を確かめて、もう一度読み込んでください。"
            : failure.message}
        </Notice>
      </div>
    );
  }
  return hasMore ? (
    <div ref={sentinel}>
      <p className="p-end" role="status">
        {loading ? "続きを読み込んでいます" : ""}
      </p>
      {loading ? null : (
        <Button variant="secondary" fit onClick={loadMore}>
          続きを読み込む
        </Button>
      )}
    </div>
  ) : (
    <p className="p-end">{endText}</p>
  );
}
