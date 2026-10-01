"use client";

import { useNavigate } from "@tanstack/react-router";
import { useRef, useState, useTransition } from "react";
import {
  ManageHeading,
  ManageNav,
  ManagePage,
  ManageTitle,
  ProxyBanner,
} from "@/components/layout/ManageShell";
import { OpsSearchReturnLink } from "@/components/ops/OpsSearchReturn";
import { rememberProxyVisit } from "@/components/ops/ProxyReturn";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { HydrationGate } from "@/components/ui/HydrationGate";
import { Notice } from "@/components/ui/Notice";
import { TextLink } from "@/components/ui/TextButton";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { newId } from "@/presentation/newId";
import type { AreaLists } from "@/presentation/placeView";
import { registerRegionFn } from "@/presentation/region";
import {
  EMPTY_REGION_FORM,
  REGION_FIELD_ANCHOR,
  REGION_FIELD_LABEL,
  REGION_FIELDS,
  type RegionFieldErrors,
  type RegionFormValues,
  regionFieldErrors,
  toRegionContent,
} from "@/presentation/regionForm";
import { REGION_ID_CONFLICT } from "@/presentation/regionView";
import { RegionFormFields } from "../RegionFormFields";
import { regionProxyKey } from "../RegionShell";

type SubmitState = Readonly<{
  error: ErrorState | null;
  fields: RegionFieldErrors;
}>;

function RegisterNav() {
  return (
    <ManageNav
      label="地域の運営"
      proxy={
        <ProxyBanner label="サービス運営者として登録中">
          <OpsSearchReturnLink />
        </ProxyBanner>
      }
      links={<TextLink to="/me">マイページ</TextLink>}
    />
  );
}

/**
 * RM-02 新規 (REG-12): an operator registers a region as a draft, publish
 * requirements unchecked, and lands on its RM-02 to go on to publish it —
 * by absence proxy, since the region has no steward yet. The registration
 * is idempotent on the id minted for this entry, so a lost answer is
 * resent as a replay; an edited resend of a stored registration is told
 * apart (CS-08).
 */
export function NewRegionEditor({ lists }: { lists: AreaLists }) {
  const navigate = useNavigate();
  const [values, setValues] = useState<RegionFormValues>(EMPTY_REGION_FORM);
  const [state, setState] = useState<SubmitState>({ error: null, fields: {} });
  const [registering, startRegister] = useTransition();
  // Kept until the registration is known to have gone through: a failed
  // attempt may have been stored with only its answer lost, so a resend
  // (edited or not) must reach the same id.
  const attemptId = useRef<string | null>(null);
  const [taken, setTaken] = useState<string | null>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(EMPTY_REGION_FORM);

  const register = () =>
    startRegister(async () => {
      setTaken(null);
      const built = toRegionContent(values);
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
      const regionId = attemptId.current;
      try {
        await registerRegionFn({ data: { regionId, content: built.content } });
        attemptId.current = null;
        rememberProxyVisit(regionProxyKey(regionId));
        await navigate({
          to: "/manage/regions/$regionId/info",
          params: { regionId },
          search: { created: true },
        });
      } catch (error) {
        const classified = classifyError(error);
        if (
          classified.kind === "conflict" &&
          classified.code === REGION_ID_CONFLICT
        ) {
          setTaken(regionId);
          setState({ error: null, fields: {} });
          return;
        }
        setState({ error: classified, fields: regionFieldErrors(classified) });
      }
    });

  const failure = state.error;
  const listed = REGION_FIELDS.filter(
    (field) => state.fields[field] !== undefined,
  );
  return (
    <ManagePage
      title={
        <ManageTitle>
          <ManageHeading>地域を登録</ManageHeading>
        </ManageTitle>
      }
      nav={<RegisterNav />}
      actions={
        <HydrationGate>
          <Button type="submit" form="region-form" disabled={registering}>
            {registering ? "登録しています…" : "登録する"}
          </Button>
        </HydrationGate>
      }
      {...(dirty
        ? {
            actionsNote:
              "登録していない入力があります。登録せずに画面を離れると、地域は登録されず、入力した内容は残りません。",
          }
        : {})}
    >
      <form
        className="m-body"
        id="region-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          register();
        }}
      >
        <HydrationGate>
          {taken === null ? null : (
            <Alert
              title="この地域は、すでに登録されていました"
              actions={
                <ButtonLink
                  variant="secondary"
                  to="/manage/regions/$regionId/info"
                  params={{ regionId: taken }}
                  onClick={() => rememberProxyVisit(regionProxyKey(taken))}
                >
                  登録された地域情報を開く
                </ButtonLink>
              }
            >
              通信が途切れる前の登録が届いていました。そのあとに変えた内容は登録していません。登録された地域を開いて、地域情報を確かめてください。
            </Alert>
          )}
          {failure === null ? null : failure.kind === "invalidInput" ? (
            <Alert
              title="登録できませんでした"
              list={listed.map((field) => (
                <li key={field}>
                  <a
                    className="text-button"
                    href={`#${REGION_FIELD_ANCHOR[field]}`}
                  >
                    {REGION_FIELD_LABEL[field]}
                  </a>
                </li>
              ))}
            >
              {listed.length === 0
                ? failure.message
                : "次の項目を直してください。"}
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
          <Notice
            variant="manage"
            tone="paper"
            title="地域を下書きとして登録します"
          >
            保存すると、地域は下書きとして登録され、この画面のまま公開へ進めます。保存せずにやめると、地域は登録されません。登録した地域は運営者が不在の地域になります。管理権限は、メンバーから付与します。
          </Notice>
          <RegionFormFields
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
