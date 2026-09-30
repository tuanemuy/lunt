"use client";

import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export const SEARCH_INPUT_ID = "search-keyword";

/**
 * Lunt/Input as VW-03's keyword field. Searching puts the keyword in the
 * URL (`/search?q=`), where the route decides: blank is 「キーワード未入力」
 * without a search, anything else is searched. The field starts from the
 * URL's keyword, so a result keeps its keyword (「検索語は保つ」).
 */
export function SearchForm({
  keyword,
  error,
}: {
  keyword: string;
  /** Why the keyword was not searched (キーワード未入力, too long). */
  error: string | null;
}) {
  const navigate = useNavigate();
  const [value, setValue] = useState(keyword);
  const errorId = `${SEARCH_INPUT_ID}-error`;
  return (
    <search>
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate({ to: "/search", search: { q: value } });
        }}
      >
        <label
          className="search-field"
          data-invalid={error !== null || undefined}
        >
          <Icon name="search" />
          <span className="sr-only">キーワード</span>
          <input
            id={SEARCH_INPUT_ID}
            type="search"
            name="q"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="お店・地域・気になるもの"
            autoComplete="off"
            enterKeyHint="search"
            aria-invalid={error !== null || undefined}
            aria-describedby={error === null ? undefined : errorId}
          />
        </label>
        {error === null ? null : (
          <p className="search-form__error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </form>
    </search>
  );
}
