"use client";

import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Field, Input } from "@/components/ui/Field";
import { MATCH_TERM_MAX } from "@/presentation/findPlace";

export const FIND_PLACE_FORM_ID = "rq01-search";

const NOTHING_ENTERED = "店名か住所を入力してから探してください。";

/**
 * RQ-01's 名称・所在地 fields (「探し方」: either or both). Searching puts
 * the terms in the URL, whose loader reads the results; with neither
 * entered nothing is searched and the fields say why (CS-10). Without
 * script the form is a plain GET of the same URL.
 */
export function FindPlaceForm({
  name,
  address,
  searched,
}: {
  name: string;
  address: string;
  /** A search has been made (the 「ログインしなくても探せます」 hint is for before it). */
  searched: boolean;
}) {
  const navigate = useNavigate();
  const [nothing, setNothing] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const invalid = nothing ? { error: NOTHING_ENTERED } : {};
  return (
    <search>
      <form
        id={FIND_PLACE_FORM_ID}
        className="m-form"
        method="get"
        action="/apply/find-place"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const typedName = String(form.get("name") ?? "").trim();
          const typedAddress = String(form.get("address") ?? "").trim();
          if (typedName === "" && typedAddress === "") {
            setNothing(true);
            nameInput.current?.focus();
            return;
          }
          setNothing(false);
          void navigate({
            to: "/apply/find-place",
            search: {
              ...(typedName === "" ? {} : { name: typedName }),
              ...(typedAddress === "" ? {} : { address: typedAddress }),
            },
          });
        }}
      >
        <Field
          id="rq01-name"
          label="店名"
          {...invalid}
          {...(searched ? {} : { help: "ログインしなくても探せます。" })}
        >
          {(control) => (
            <Input
              {...control}
              ref={nameInput}
              name="name"
              type="search"
              maxLength={MATCH_TERM_MAX}
              placeholder="例: 喫茶 日々"
              defaultValue={name}
            />
          )}
        </Field>
        <Field id="rq01-address" label="住所">
          {(control) => (
            <Input
              {...control}
              {...(nothing ? { "aria-invalid": true as const } : {})}
              name="address"
              type="search"
              maxLength={MATCH_TERM_MAX}
              placeholder="例: 緑野市旧市街"
              defaultValue={address}
            />
          )}
        </Field>
      </form>
    </search>
  );
}
