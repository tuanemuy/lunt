"use client";

import { useId, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { RowLink, Rows } from "@/components/ui/Rows";
import type { SimilarPlace } from "@/presentation/applicationReview";
import { classifyError } from "@/presentation/errorState";
import {
  type MatchPage,
  type PlaceMatchItem,
  searchPlacesFn,
} from "@/presentation/opsSearch";

const SEARCH_LIMIT = 20;

/** OM-03 of a store: where the operator checks a candidate. */
export const subjectPath = (placeId: string): string =>
  `/ops/subjects/place/${encodeURIComponent(placeId)}`;

/** Candidate stores (suspended ones marked 非公開), each opening its OM-03. */
export function PlaceCandidates({
  places,
}: {
  places: readonly Pick<
    SimilarPlace,
    "placeId" | "name" | "address" | "suspended"
  >[];
}) {
  return (
    <Rows>
      {places.map((place) => (
        <li key={place.placeId}>
          <RowLink
            to={subjectPath(place.placeId)}
            photo={null}
            name={place.name}
            meta={place.address}
            sub={
              place.suspended ? (
                <>
                  <Badge tone="alert">非公開</Badge> 非公開の店舗
                </>
              ) : (
                "公開中"
              )
            }
          />
        </li>
      ))}
    </Rows>
  );
}

type SearchState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "found"; page: MatchPage<PlaceMatchItem> }>
  | Readonly<{ kind: "failed"; message: string }>;

/**
 * CF-02 for CM-01's registration: the operator looks for an existing
 * store by name and / or address among every store, suspended ones
 * included. Searching with neither is CS-10.
 */
export function PlaceMatchSearch() {
  const id = useId();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [missing, setMissing] = useState(false);
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const [searching, startSearch] = useTransition();
  const errorId = `${id}-error`;

  const search = () => {
    if (name.trim() === "" && address.trim() === "") {
      setMissing(true);
      return;
    }
    setMissing(false);
    startSearch(async () => {
      try {
        const page = await searchPlacesFn({
          data: { name, address, page: 1, limit: SEARCH_LIMIT },
        });
        setState(
          page.count === 0 ? { kind: "empty" } : { kind: "found", page },
        );
      } catch (error) {
        const failure = classifyError(error);
        setState({
          kind: "failed",
          message:
            failure.kind === "failed"
              ? "通信を確かめて、もう一度探してください。"
              : failure.message,
        });
      }
    });
  };

  const invalid = missing
    ? { "aria-invalid": true as const, "aria-describedby": errorId }
    : {};

  return (
    <>
      <form
        className="m-field"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <p className="m-field__label">既存の店舗を探す</p>
        <div className="cm01-search">
          <Input
            type="search"
            name="name"
            aria-label="名称"
            placeholder="名称（例: こだま）"
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            {...invalid}
          />
          <Input
            type="search"
            name="address"
            aria-label="所在地"
            placeholder="所在地（例: 緑野市新町）"
            maxLength={100}
            value={address}
            onChange={(event) => setAddress(event.currentTarget.value)}
            {...invalid}
          />
          <Button variant="secondary" type="submit" disabled={searching}>
            {searching ? "探しています…" : "探す"}
          </Button>
        </div>
        {missing ? (
          <p className="m-field__error" id={errorId}>
            名称か所在地のどちらかを入力してください。
          </p>
        ) : null}
        <p className="m-field__help">
          非公開の店舗を含む、すべての店舗から探します。非公開の店舗は「非公開」と示します。
        </p>
      </form>
      <div aria-live="polite" aria-busy={searching}>
        {state.kind === "found" ? (
          <PlaceCandidates places={state.page.items} />
        ) : state.kind === "empty" ? (
          <Notice variant="manage" tone="paper" title="見つかりませんでした">
            名称か所在地を変えて、もう一度探してください。
          </Notice>
        ) : state.kind === "failed" ? (
          <Notice variant="manage" tone="paper" title="探せませんでした">
            {state.message}
          </Notice>
        ) : null}
      </div>
    </>
  );
}
