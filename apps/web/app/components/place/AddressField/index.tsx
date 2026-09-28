"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { browseAreaFn, findTownsFn } from "@/presentation/area";
import { classifyError } from "@/presentation/errorState";
import {
  type AreaLists,
  type AreaOption,
  type TownOption,
  townKey,
  townOptionText,
} from "@/presentation/placeView";

type AddressFieldProps = {
  town: TownOption | null;
  rest: string;
  onTownChange: (town: TownOption | null) => void;
  onRestChange: (rest: string) => void;
  /** The lists the selects start from (the saved town's, or the prefectures only). */
  lists: AreaLists;
  townError?: string;
  restError?: string;
  disabled?: boolean;
};

const lookupFailure = (error: unknown): string => {
  const state = classifyError(error);
  if (state.kind === "failed") {
    return "町域を探せませんでした。通信を確かめて、もう一度探してください";
  }
  return state.kind === "invalidInput" &&
    Object.keys(state.fieldErrors).length > 0
    ? (Object.values(state.fieldErrors).flat()[0] ?? state.message)
    : state.message;
};

/**
 * CF-07 所在地: a town picked from a postal code's candidates, or down the
 * prefecture → municipality → town hierarchy, then the part after it. The
 * area is the town's; the user never enters it.
 */
export function AddressField({
  town,
  rest,
  onTownChange,
  onRestChange,
  lists,
  townError,
  restError,
  disabled = false,
}: AddressFieldProps) {
  const ids = {
    postal: "place-postal",
    prefecture: "place-prefecture",
    municipality: "place-municipality",
    town: "place-town",
    rest: "place-address-rest",
  };
  const [postal, setPostal] = useState(() =>
    town === null
      ? ""
      : `${town.areaCode.slice(0, 3)}-${town.areaCode.slice(3)}`,
  );
  const [prefectureCode, setPrefectureCode] = useState(
    town?.prefectureCode ?? "",
  );
  const [municipalityCode, setMunicipalityCode] = useState(
    town?.municipalityCode ?? "",
  );
  const [municipalities, setMunicipalities] = useState<readonly AreaOption[]>(
    lists.municipalities,
  );
  const [towns, setTowns] = useState<readonly TownOption[]>(lists.towns);
  const [candidates, setCandidates] = useState<readonly TownOption[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, startLookup] = useTransition();
  const [browsing, startBrowse] = useTransition();

  /** Picks a postal code's town and fills the selects above it. */
  const pick = (picked: TownOption) => {
    setPrefectureCode(picked.prefectureCode);
    setMunicipalityCode(picked.municipalityCode);
    setCandidates([]);
    setTowns([picked]);
    onTownChange(picked);
    startBrowse(async () => {
      try {
        const [municipalityList, townList] = await Promise.all([
          browseAreaFn({
            data: {
              level: "municipalities",
              prefectureCode: picked.prefectureCode,
            },
          }),
          browseAreaFn({
            data: { level: "towns", municipalityCode: picked.municipalityCode },
          }),
        ]);
        if (municipalityList.level === "municipalities") {
          setMunicipalities(municipalityList.items);
        }
        if (townList.level === "towns") setTowns(townList.items);
      } catch (error) {
        setLookupError(lookupFailure(error));
      }
    });
  };

  const lookUp = () => {
    setLookupError(null);
    startLookup(async () => {
      try {
        const found = await findTownsFn({ data: { postalCode: postal } });
        const [first] = found;
        if (first === undefined) {
          // The town picked for another code no longer matches what was typed.
          setCandidates([]);
          onTownChange(null);
          setLookupError(
            "この郵便番号の町域は見つかりません。都道府県から町域を選んでください",
          );
          return;
        }
        if (found.length === 1) {
          pick(first);
        } else {
          onTownChange(null);
          setCandidates(found);
        }
      } catch (error) {
        setCandidates([]);
        if (classifyError(error).kind !== "failed") onTownChange(null);
        setLookupError(lookupFailure(error));
      }
    });
  };

  const choosePrefecture = (code: string) => {
    setPrefectureCode(code);
    setMunicipalityCode("");
    setMunicipalities([]);
    setTowns([]);
    onTownChange(null);
    if (code === "") return;
    startBrowse(async () => {
      try {
        const result = await browseAreaFn({
          data: { level: "municipalities", prefectureCode: code },
        });
        if (result.level === "municipalities") setMunicipalities(result.items);
      } catch (error) {
        setLookupError(lookupFailure(error));
      }
    });
  };

  const chooseMunicipality = (code: string) => {
    setMunicipalityCode(code);
    setTowns([]);
    onTownChange(null);
    if (code === "") return;
    startBrowse(async () => {
      try {
        const result = await browseAreaFn({
          data: { level: "towns", municipalityCode: code },
        });
        if (result.level === "towns") setTowns(result.items);
      } catch (error) {
        setLookupError(lookupFailure(error));
      }
    });
  };

  const postalError = lookupError ?? undefined;
  return (
    <fieldset className="sm02-group" id="address">
      <legend className="m-field__label">
        所在地<span className="m-field__req">必須</span>
      </legend>
      <Field
        id={ids.postal}
        label="郵便番号"
        help="郵便番号から町域の候補を出します。都道府県・市区町村・町域を順に選ぶこともできます。"
        {...(postalError === undefined ? {} : { error: postalError })}
      >
        {(control) => (
          <div className="m-inline">
            <Input
              {...control}
              name="postalCode"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="例: 123-4567"
              value={postal}
              disabled={disabled}
              onChange={(event) => setPostal(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  lookUp();
                }
              }}
            />
            <Button
              variant="secondary"
              disabled={disabled || looking || postal.trim() === ""}
              onClick={lookUp}
            >
              {looking ? "探しています…" : "町域を探す"}
            </Button>
          </div>
        )}
      </Field>
      {candidates.length === 0 ? null : (
        <fieldset className="sm02-candidates">
          <legend className="m-field__help">
            この郵便番号の町域が複数あります。当てはまる町域を選んでください。
          </legend>
          {candidates.map((candidate) => (
            <Button
              key={`${candidate.municipalityCode}|${townKey(candidate)}`}
              variant="secondary"
              onClick={() => pick(candidate)}
            >
              {candidate.label}
            </Button>
          ))}
        </fieldset>
      )}
      <div className="sm02-area" aria-busy={browsing}>
        <Field id={ids.prefecture} label="都道府県">
          {(control) => (
            <Select
              {...control}
              value={prefectureCode}
              disabled={disabled}
              onChange={(event) => choosePrefecture(event.currentTarget.value)}
            >
              <option value="">選ぶ</option>
              {lists.prefectures.map((prefecture) => (
                <option key={prefecture.code} value={prefecture.code}>
                  {prefecture.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id={ids.municipality} label="市区町村">
          {(control) => (
            <Select
              {...control}
              value={municipalityCode}
              disabled={disabled || municipalities.length === 0}
              onChange={(event) =>
                chooseMunicipality(event.currentTarget.value)
              }
            >
              <option value="">選ぶ</option>
              {municipalities.map((municipality) => (
                <option key={municipality.code} value={municipality.code}>
                  {municipality.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          id={ids.town}
          label="町域"
          {...(townError === undefined ? {} : { error: townError })}
        >
          {(control) => (
            <Select
              {...control}
              value={town === null ? "" : townKey(town)}
              disabled={disabled || towns.length === 0}
              onChange={(event) => {
                const key = event.currentTarget.value;
                onTownChange(
                  towns.find((candidate) => townKey(candidate) === key) ?? null,
                );
              }}
            >
              <option value="">選ぶ</option>
              {towns.map((option) => (
                <option key={townKey(option)} value={townKey(option)}>
                  {townOptionText(option)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field
        id={ids.rest}
        label="町域より後（番地・建物名）"
        help={
          town === null
            ? "エリアは、選んだ町域で決まります。"
            : `エリアは、選んだ町域で決まります（${town.municipalityName}${town.name === "" ? "" : `・${town.name}`}）。`
        }
        {...(restError === undefined ? {} : { error: restError })}
      >
        {(control) => (
          <Input
            {...control}
            name="addressRest"
            placeholder="例: 1-2-3 こもれびビル 1階"
            value={rest}
            disabled={disabled}
            onChange={(event) => onRestChange(event.currentTarget.value)}
          />
        )}
      </Field>
    </fieldset>
  );
}
