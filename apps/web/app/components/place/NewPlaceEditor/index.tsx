"use client";

import { useRef, useState, useTransition } from "react";
import {
  ManageHeading,
  ManageNav,
  ManagePage,
  ManageTitle,
  ProxyBanner,
} from "@/components/layout/ManageShell";
import { OpsSearchReturnLink } from "@/components/ops/OpsSearchReturn";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { DonePanel } from "@/components/ui/DonePanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { HydrationGate } from "@/components/ui/HydrationGate";
import { TextLink } from "@/components/ui/TextButton";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { newId } from "@/presentation/newId";
import { registerPlaceByProxyFn } from "@/presentation/place";
import {
  PLACE_FIELD_LABEL,
  PLACE_FIELDS,
  type PlaceFieldErrors,
  type PlaceFormValues,
  placeFieldErrors,
  toPlaceProfile,
} from "@/presentation/placeForm";
import type { AreaLists } from "@/presentation/placeView";
import { PLACE_FIELD_ANCHOR, PlaceFormFields } from "../PlaceFormFields";

const EMPTY: PlaceFormValues = {
  photos: [],
  name: "",
  town: null,
  addressRest: "",
  latitude: "",
  longitude: "",
  businessHours: "",
  description: "",
  contact: "",
};

type Registered = Readonly<{ placeId: string; name: string }>;

type SubmitState = Readonly<{
  error: ErrorState | null;
  fields: PlaceFieldErrors;
}>;

/** `registerPlaceByProxy`'s answer when the id already holds another store. */
const PLACE_ID_CONFLICT = "PLACE_ID_CONFLICT";

function ProxyNav() {
  return (
    <ManageNav
      label="店舗の管理"
      proxy={
        <ProxyBanner label="サービス運営者として代理登録中">
          <OpsSearchReturnLink />
        </ProxyBanner>
      }
      links={<TextLink to="/me">マイページ</TextLink>}
    />
  );
}

/**
 * SM-02 新規（代理登録）(SHP-12): an operator, having made sure on OM-02
 * that the store is not there, registers it. It is published as a store
 * without a steward; the registration is idempotent on the id minted for
 * this entry, so a lost answer is resent as a replay, and an edited resend
 * of a stored registration is told apart (CS-08).
 */
export function NewPlaceEditor({ lists }: { lists: AreaLists }) {
  const [values, setValues] = useState<PlaceFormValues>(EMPTY);
  const [state, setState] = useState<SubmitState>({ error: null, fields: {} });
  const [registered, setRegistered] = useState<Registered | null>(null);
  const [registering, startRegister] = useTransition();
  // Kept until the registration is known to have gone through: a failed
  // attempt may have been stored with only its answer lost, so a resend
  // (edited or not) must reach the same id.
  const attemptId = useRef<string | null>(null);
  const [taken, setTaken] = useState<string | null>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(EMPTY);

  const register = () =>
    startRegister(async () => {
      setTaken(null);
      const built = toPlaceProfile(values);
      if (!built.ok) {
        setState({
          error: {
            kind: "invalidInput",
            code: null,
            message: "入力内容を確かめてください",
            fieldErrors: {},
            missing: [],
          },
          fields: built.errors,
        });
        return;
      }
      attemptId.current ??= newId();
      const placeId = attemptId.current;
      try {
        const place = await registerPlaceByProxyFn({
          data: { placeId, profile: built.profile },
        });
        attemptId.current = null;
        setRegistered(place);
      } catch (error) {
        const classified = classifyError(error);
        if (
          classified.kind === "conflict" &&
          classified.code === PLACE_ID_CONFLICT
        ) {
          setTaken(placeId);
          setState({ error: null, fields: {} });
          return;
        }
        setState({ error: classified, fields: placeFieldErrors(classified) });
      }
    });

  const title = (
    <ManageTitle>
      <ManageHeading>店舗を登録</ManageHeading>
    </ManageTitle>
  );

  if (registered !== null) {
    const params = { placeId: registered.placeId };
    return (
      <ManagePage title={title} nav={<ProxyNav />}>
        <FocusOnMount>
          <DonePanel
            title="店舗を登録しました"
            actions={
              <>
                <ButtonLink to="/manage/places/$placeId/info" params={params}>
                  店舗情報を編集する
                </ButtonLink>
                <ButtonLink
                  variant="secondary"
                  to="/manage/places/$placeId/listings"
                  params={params}
                >
                  掲載の一覧へ
                </ButtonLink>
                <ButtonLink
                  variant="secondary"
                  to="/ops/subjects/$kind/$id"
                  params={{ kind: "place", id: registered.placeId }}
                >
                  店舗の運営へ
                </ButtonLink>
              </>
            }
          >
            {`${registered.name}を、管理者のいない店舗として公開しました。続けて、不在の代行で店舗情報と掲載を整えられます。`}
          </DonePanel>
        </FocusOnMount>
      </ManagePage>
    );
  }

  const failure = state.error;
  const listed = PLACE_FIELDS.filter(
    (field) => state.fields[field] !== undefined,
  );
  return (
    <ManagePage
      title={title}
      nav={<ProxyNav />}
      actions={
        <HydrationGate>
          <Button type="submit" form="shop-form" disabled={registering}>
            {registering ? "登録しています…" : "登録する"}
          </Button>
        </HydrationGate>
      }
      {...(dirty
        ? {
            actionsNote:
              "登録していない入力があります。登録せずに画面を離れると、店舗は作られず、入力した内容は残りません。",
          }
        : {})}
    >
      <form
        className="m-body"
        id="shop-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          register();
        }}
      >
        <HydrationGate>
          {taken === null ? null : (
            <Alert
              title="この店舗は、すでに登録されていました"
              actions={
                <>
                  <ButtonLink
                    variant="secondary"
                    to="/manage/places/$placeId/info"
                    params={{ placeId: taken }}
                  >
                    登録された店舗情報を開く
                  </ButtonLink>
                  <ButtonLink
                    variant="secondary"
                    to="/ops/subjects/$kind/$id"
                    params={{ kind: "place", id: taken }}
                  >
                    店舗の運営へ
                  </ButtonLink>
                </>
              }
            >
              通信が途切れる前の登録が届いていました。そのあとに変えた内容は登録していません。登録された店舗を開いて、店舗情報を確かめてください。
            </Alert>
          )}
          {failure === null ? null : failure.kind === "invalidInput" ? (
            <Alert
              title="登録できませんでした"
              list={listed.map((field) => (
                <li key={field}>
                  <a
                    className="text-button"
                    href={`#${PLACE_FIELD_ANCHOR[field]}`}
                  >
                    {PLACE_FIELD_LABEL[field]}
                  </a>
                </li>
              ))}
            >
              {listed.length === 0
                ? failure.message
                : "店舗の名称・所在地・位置は、店舗を公開するための条件です。次の項目を直してください。"}
            </Alert>
          ) : (
            <Alert
              title="登録できませんでした"
              {...(failure.kind === "failed"
                ? {
                    actions: (
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={registering}
                      >
                        もう一度登録
                      </Button>
                    ),
                  }
                : {})}
            >
              {failure.kind === "failed"
                ? "通信を確かめて、もう一度登録してください。入力した内容は残っています。"
                : failure.message}
            </Alert>
          )}
          <p className="om02-lead">
            登録した店舗は、管理者のいない店舗として公開されます。非公開の店舗を含めて、同じ店舗がないことを「対象を探す」で確かめてから登録します。
          </p>
          <PlaceFormFields
            values={values}
            onChange={(change) =>
              setValues((current) => ({ ...current, ...change }))
            }
            errors={state.fields}
            lists={lists}
            disabled={registering}
          />
        </HydrationGate>
      </form>
    </ManagePage>
  );
}
