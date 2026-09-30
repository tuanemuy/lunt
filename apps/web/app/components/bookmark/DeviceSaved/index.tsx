"use client";

import { DeviceSaves } from "@repo/core/application/bookmark/deviceSaves";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { resolveDeviceSavedFn } from "@/presentation/bookmark";
import { deviceSaves, useDeviceSaves } from "@/presentation/deviceSaveStore";
import {
  SAVED_PAGE_SIZE,
  type SavedPage,
  type SaveTarget,
} from "@/presentation/savedView";
import { SavedBoard, type SavedSource } from "../SavedBoard";
import { SavedLoadFailure } from "../SavedFeedback";
import { SavedSkeleton } from "../SavedSkeleton";

type Loaded =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; order: readonly SaveTarget[]; first: SavedPage }>
  | Readonly<{ kind: "failed"; order: readonly SaveTarget[] }>;

function ReadyBoard({
  order,
  first,
}: {
  order: readonly SaveTarget[];
  first: SavedPage;
}) {
  const source = useMemo<SavedSource>(
    () => ({ mode: "device", order }),
    [order],
  );
  return <SavedBoard source={source} first={first} />;
}

/**
 * VW-10 「端末の保存」 (signed out): the browser's saves, newest first, read
 * after hydration and resolved by Discovery a page at a time — their
 * content and whether they are viewable. The order is taken once per
 * opening (later changes are this screen's own toggles, whose rows keep
 * their place until the screen is opened again). A failed read is CS-02
 * with a retry; the saves stay on the device.
 */
export function DeviceSaved() {
  const hydrated = useDeviceSaves() !== null;
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [retrying, startRetry] = useTransition();

  const resolve = useCallback(async (order: readonly SaveTarget[]) => {
    if (order.length === 0) {
      setLoaded({ kind: "ready", order, first: { items: [], count: 0 } });
      return;
    }
    try {
      const items = await resolveDeviceSavedFn({
        data: { targets: order.slice(0, SAVED_PAGE_SIZE) },
      });
      setLoaded({
        kind: "ready",
        order,
        first: { items, count: order.length },
      });
    } catch {
      setLoaded({ kind: "failed", order });
    }
  }, []);

  useEffect(() => {
    if (!hydrated || loaded.kind !== "loading") return;
    const order = DeviceSaves.ordered(deviceSaves.snapshot()).map(
      ({ kind, id }) => ({ kind, id }),
    );
    void resolve(order);
  }, [hydrated, loaded.kind, resolve]);

  switch (loaded.kind) {
    case "loading":
      return <SavedSkeleton />;
    case "failed":
      return (
        <SavedLoadFailure
          retrying={retrying}
          onRetry={() =>
            startRetry(async () => {
              await resolve(loaded.order);
            })
          }
        />
      );
    case "ready":
      return <ReadyBoard order={loaded.order} first={loaded.first} />;
  }
}
