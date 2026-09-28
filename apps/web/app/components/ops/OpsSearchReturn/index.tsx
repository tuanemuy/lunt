"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { TextLink } from "@/components/ui/TextButton";
import {
  type OpsSearch,
  opsSearchSearchSchema,
} from "@/presentation/opsSearch";

const KEY = "lunt:om02-search";

/**
 * Keeps OM-02's last search for this tab, so the screens an operator
 * opens from its results (OM-03, the absence proxy, the proxy
 * registration) lead back to the same results.
 */
export function useRememberOpsSearch(search: OpsSearch): void {
  useEffect(() => {
    if (search.kind === undefined) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(search));
    } catch {
      // Storage refused (private mode, quota): the way back opens OM-02 empty.
    }
  }, [search]);
}

function readRemembered(): OpsSearch {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return {};
    return opsSearchSearchSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** OM-02's last search, read after hydration (the server has none). */
function useRememberedOpsSearch(): OpsSearch {
  const [search, setSearch] = useState<OpsSearch>({});
  useEffect(() => setSearch(readRemembered()), []);
  return search;
}

/** 対象を探すへ戻る, to the operator's last OM-02 search. */
export function OpsSearchReturnLink({
  variant = "text",
  className,
}: {
  variant?: "text" | "button";
  className?: string;
}) {
  const search = useRememberedOpsSearch();
  return variant === "button" ? (
    <ButtonLink to="/ops/search" search={search}>
      対象を探すへ戻る
    </ButtonLink>
  ) : (
    <TextLink
      to="/ops/search"
      search={search}
      {...(className === undefined ? {} : { className })}
    >
      対象を探すへ戻る
    </TextLink>
  );
}
