"use client";

import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { OpsSearch } from "@/presentation/opsSearch";
import { useRememberOpsSearch } from "../OpsSearchReturn";
import { forgetReportProxy } from "../ProxyReturn";

/**
 * OM-02's two searches: stores by name and / or address, listings by
 * keyword. Each puts its terms in the URL, which the results follow.
 * Regions and events join the keyword search with their stages.
 */
export function OpsSearchForms({ search }: { search: OpsSearch }) {
  const navigate = useNavigate();
  useRememberOpsSearch(search);
  // A proxy opened from OM-02 leads back here, not to a report.
  useEffect(forgetReportProxy, []);
  const [name, setName] = useState(search.name ?? "");
  const [address, setAddress] = useState(search.address ?? "");
  const [keyword, setKeyword] = useState(search.q ?? "");
  const [placeError, setPlaceError] = useState<string | null>(null);

  return (
    <>
      <search aria-labelledby="om02-place">
        <form
          className="m-section"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() === "" && address.trim() === "") {
              setPlaceError(
                "店舗の名称か所在地の、どちらかを入力してください。",
              );
              return;
            }
            setPlaceError(null);
            void navigate({
              to: "/ops/search",
              search: {
                kind: "place",
                name: name.trim(),
                address: address.trim(),
              },
            });
          }}
        >
          <SectionTitle variant="manage" id="om02-place">
            店舗を探す
          </SectionTitle>
          <div className="om02-fields">
            <Field id="om02-name" label="店舗の名称">
              {(control) => (
                <Input
                  {...control}
                  name="name"
                  placeholder="例: 喫茶 日々"
                  maxLength={100}
                  value={name}
                  aria-invalid={placeError === null ? undefined : true}
                  aria-describedby={
                    placeError === null ? undefined : "om02-place-error"
                  }
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              )}
            </Field>
            <Field id="om02-address" label="所在地">
              {(control) => (
                <Input
                  {...control}
                  name="address"
                  placeholder="例: 緑野市旧市街"
                  maxLength={100}
                  value={address}
                  aria-invalid={placeError === null ? undefined : true}
                  aria-describedby={
                    placeError === null ? undefined : "om02-place-error"
                  }
                  onChange={(event) => setAddress(event.currentTarget.value)}
                />
              )}
            </Field>
          </div>
          {placeError === null ? (
            <p className="m-field__help">
              名称か所在地の、どちらかを入力して探します。
            </p>
          ) : (
            <p className="m-field__error" id="om02-place-error" role="alert">
              {placeError}
            </p>
          )}
          <Button type="submit" className="om02-submit">
            店舗を探す
          </Button>
        </form>
      </search>

      <search aria-labelledby="om02-keyword">
        <form
          className="m-section"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void navigate({
              to: "/ops/search",
              search: { kind: "keyword", q: keyword.trim() },
            });
          }}
        >
          <SectionTitle variant="manage" id="om02-keyword">
            掲載を探す
          </SectionTitle>
          <Field
            id="om02-q"
            label="キーワード"
            help="下書き・一時非公開・運営による非公開の掲載と、非公開の店舗の掲載も含めて探します。"
          >
            {(control) => (
              <div className="m-inline">
                <Input
                  {...control}
                  name="q"
                  placeholder="例: パフェ"
                  maxLength={100}
                  value={keyword}
                  onChange={(event) => setKeyword(event.currentTarget.value)}
                />
                <Button type="submit" variant="secondary">
                  探す
                </Button>
              </div>
            )}
          </Field>
        </form>
      </search>
    </>
  );
}
