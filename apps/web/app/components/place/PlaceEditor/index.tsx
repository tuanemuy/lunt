"use client";

import { useRouter } from "@tanstack/react-router";
import { useRef, useState, useTransition } from "react";
import { ManageBody } from "@/components/layout/ManageShell";
import {
  placeMembersPath,
  placePagePath,
  ShopPage,
} from "@/components/manage/ShopShell";
import { usePlaceFrame } from "@/components/manage/ShopShell/usePlaceFrame";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TextLink } from "@/components/ui/TextButton";
import {
  isDirty,
  movedDraft,
  reloadDraft,
  savedDraft,
  settledDraft,
  useEditDraft,
} from "@/presentation/editDraft";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { updatePlaceProfileFn } from "@/presentation/place";
import {
  PLACE_FIELD_LABEL,
  PLACE_FIELDS,
  type PlaceFieldErrors,
  type PlaceFormValues,
  placeFieldErrors,
  toPlaceProfile,
} from "@/presentation/placeForm";
import type { PlaceEditorData } from "@/presentation/placeView";
import { useReconcile } from "@/presentation/reconcile";
import { PLACE_FIELD_ANCHOR, PlaceFormFields } from "../PlaceFormFields";
import { OperatingStatusPanel } from "./OperatingStatusPanel";

export const placeFormValuesOf = (data: PlaceEditorData): PlaceFormValues => ({
  photos: data.photos,
  name: data.name,
  town: data.town,
  addressRest: data.addressRest,
  latitude: String(data.location.latitude),
  longitude: String(data.location.longitude),
  businessHours: data.businessHours,
  description: data.description,
  contact: data.contact,
});

type Outcome = Readonly<{ kind: "saved" }> | Readonly<{ kind: "lostAccess" }>;

type SaveState = Readonly<{
  error: ErrorState | null;
  fields: PlaceFieldErrors;
}>;

const NO_ERROR: SaveState = { error: null, fields: {} };

function FieldList({ fields }: { fields: PlaceFieldErrors }) {
  const listed = PLACE_FIELDS.filter((field) => fields[field] !== undefined);
  return listed.map((field) => (
    <li key={field}>
      <a className="text-button" href={`#${PLACE_FIELD_ANCHOR[field]}`}>
        {PLACE_FIELD_LABEL[field]}
      </a>
    </li>
  ));
}

/**
 * SM-02 店舗情報 (編集): the whole profile saved at once without an
 * application, and the operating status changed on its own (SHP-06,
 * SHP-07, SHP-13). The steward, or an operator standing in (CS-14).
 */
export function PlaceEditor({ data }: { data: PlaceEditorData }) {
  const frame = usePlaceFrame();
  const router = useRouter();
  const reconcile = useReconcile();
  const proxy = frame.basis === "proxy";
  const [draft, setDraft] = useEditDraft(data, placeFormValuesOf);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const { values } = draft;
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [resumed, setResumed] = useState(false);
  const dirty = isDirty(draft);

  const [saveState, setSaveState] = useState<SaveState>(NO_ERROR);
  const [saving, startSave] = useTransition();
  const save = () =>
    startSave(async () => {
      setDraft(settledDraft);
      const { values: submitted, version } = draftRef.current;
      const built = toPlaceProfile(submitted);
      if (!built.ok) {
        setSaveState({
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
      try {
        const saved = await updatePlaceProfileFn({
          data: { placeId: data.placeId, version, profile: built.profile },
        });
        setDraft((current) => savedDraft(current, submitted, saved.version));
        setSaveState(NO_ERROR);
        setOutcome({ kind: "saved" });
        await reconcile();
      } catch (error) {
        const state = classifyError(error);
        if (state.kind === "forbidden" && !proxy) {
          setOutcome({ kind: "lostAccess" });
          router.clearCache();
        }
        setSaveState({ error: state, fields: placeFieldErrors(state) });
      }
    });
  const failure = saveState.error;
  const fields = (
    <PlaceFormFields
      values={values}
      onChange={(change) =>
        setDraft((current) => ({
          ...current,
          values: { ...current.values, ...change },
        }))
      }
      errors={saveState.fields}
      lists={data.areaLists}
      disabled={saving}
    />
  );

  if (outcome?.kind === "lostAccess") {
    return (
      <ShopPage frame={frame} heading="店舗情報">
        <ManageBody>
          <FocusOnMount role="alert">
            <EmptyPanel
              title="この店舗の店舗管理者ではありません"
              actions={
                <>
                  <ButtonLink to="/me">マイページへ戻る</ButtonLink>
                  <ButtonLink
                    variant="secondary"
                    to={placePagePath(frame.placeId)}
                  >
                    店舗ページを見る
                  </ButtonLink>
                </>
              }
            >
              店舗の管理権限がなくなったため、変更は保存していません。
            </EmptyPanel>
          </FocusOnMount>
        </ManageBody>
      </ShopPage>
    );
  }

  if (outcome !== null) {
    const continueEditing = (
      <Button
        variant="secondary"
        onClick={() => {
          setOutcome(null);
          setResumed(true);
        }}
      >
        店舗情報の編集を続ける
      </Button>
    );
    return (
      <ShopPage frame={frame} heading="店舗情報を編集">
        <FocusOnMount>
          <DonePanel
            title="店舗情報を保存しました"
            actions={
              <>
                {proxy ? (
                  <ButtonLink
                    to="/manage/places/$placeId/listings"
                    params={{ placeId: frame.placeId }}
                  >
                    掲載の一覧へ
                  </ButtonLink>
                ) : (
                  <ButtonLink
                    to="/manage/places/$placeId"
                    params={{ placeId: frame.placeId }}
                  >
                    店舗ホームに戻る
                  </ButtonLink>
                )}
                <ButtonLink
                  variant="secondary"
                  to={placePagePath(frame.placeId)}
                >
                  店舗ページを見る
                </ButtonLink>
                {continueEditing}
              </>
            }
          >
            {frame.suspended
              ? "保存しました。店舗の非公開が解除されると、閲覧者に表示されます。"
              : "公開中の店舗ページに変更を反映しました。"}
          </DonePanel>
        </FocusOnMount>
      </ShopPage>
    );
  }

  return (
    <ShopPage
      frame={frame}
      heading="店舗情報を編集"
      actions={
        <Button type="submit" form="shop-form" disabled={saving}>
          {saving ? "保存しています…" : "変更を保存"}
        </Button>
      }
      {...(dirty
        ? {
            actionsNote:
              "保存していない変更があります。保存せずに画面を離れると、変更は残りません。",
          }
        : {})}
    >
      <form
        className="m-body"
        id="shop-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {failure === null ? null : failure.kind === "forbidden" && proxy ? (
          <Alert
            title="この店舗は代行できません"
            actions={
              <ButtonLink
                variant="secondary"
                to="/ops/subjects/$kind/$id"
                params={{ kind: "place", id: frame.placeId }}
              >
                店舗の運営へ戻る
              </ButtonLink>
            }
          >
            この店舗には店舗管理者が就きました。変更は保存していません。店舗の運営の画面で、管理者がいることを確かめてください。
          </Alert>
        ) : failure.kind === "conflict" ? (
          <Alert
            title="ほかの人が先に店舗情報を保存していました"
            actions={
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() =>
                  startSave(async () => {
                    setDraft(reloadDraft);
                    await reconcile();
                    setSaveState(NO_ERROR);
                  })
                }
              >
                最新の内容を読み直す
              </Button>
            }
          >
            この変更は保存していません。最新の内容を読み直してから、もう一度変更してください。
          </Alert>
        ) : failure.kind === "invalidInput" ? (
          <Alert
            title="保存できませんでした"
            list={<FieldList fields={saveState.fields} />}
          >
            {Object.keys(saveState.fields).length === 0
              ? failure.message
              : "店舗の名称・所在地・位置は、店舗を公開するための条件です。次の項目を直してください。"}
          </Alert>
        ) : failure.kind === "notFound" ? (
          <Alert title="店舗が見つかりません">{failure.message}</Alert>
        ) : (
          <Alert
            title="保存できませんでした"
            actions={
              <Button type="submit" variant="secondary" disabled={saving}>
                もう一度保存
              </Button>
            }
          >
            {failure.kind === "failed"
              ? "通信を確かめて、もう一度保存してください。入力した内容は残っています。"
              : failure.message}
          </Alert>
        )}
        {frame.suspended ? (
          <Notice variant="manage" tone="paper" title="この店舗は非公開です">
            解除されるまで、店舗と掲載は閲覧者に表示されません。情報の編集は、これまでどおり行えます。
          </Notice>
        ) : null}
        {data.photosTakenDown ? (
          <div role="status">
            <Notice
              variant="manage"
              tone="paper"
              title="申立てにより、店舗の写真が削除されました"
              actions={
                <a className="text-button" href="#photos">
                  写真を登録する
                </a>
              }
            >
              店舗は公開を続けています。写真を登録して保存すると、この表示は消えます。
            </Notice>
          </div>
        ) : null}
        {resumed ? <FocusOnMount>{fields}</FocusOnMount> : fields}
        <hr className="m-divider" />
        <OperatingStatusPanel
          placeId={data.placeId}
          version={draft.version}
          current={data.operatingStatus}
          proxy={proxy}
          suspended={frame.suspended}
          onChanged={(version) =>
            setDraft((current) => movedDraft(current, version))
          }
          onReload={() => setDraft(reloadDraft)}
          onLostAccess={() => {
            setOutcome({ kind: "lostAccess" });
            router.clearCache();
          }}
        />
        <hr className="m-divider" />
        <section className="m-section" aria-labelledby="sm02-related">
          <SectionTitle variant="manage" id="sm02-related">
            店舗の管理
          </SectionTitle>
          <LinkList>
            {proxy ? null : (
              <li>
                <ListRowLink
                  to="/manage/places/$placeId/regions"
                  params={{ placeId: frame.placeId }}
                  title="所属地域の状況"
                  meta={
                    data.regionNames.length === 0
                      ? "所属している地域はありません"
                      : `所属中 · ${data.regionNames.join("、")}`
                  }
                />
              </li>
            )}
            {proxy ? null : (
              <li>
                <ListRowLink
                  to={placeMembersPath(frame.placeId)}
                  title="メンバーの管理"
                  meta="店舗管理者の確認と招待"
                />
              </li>
            )}
            <li>
              <ListRowLink
                to={placePagePath(frame.placeId)}
                title="閲覧者に見える店舗ページ"
                meta="保存した内容は、この店舗ページにすぐ反映します"
              />
            </li>
          </LinkList>
          <Notice
            variant="manage"
            tone="paper"
            title="Lunt への掲載をやめるとき"
            actions={
              <TextLink to={placePagePath(frame.placeId)}>
                店舗ページを開く
              </TextLink>
            }
          >
            店舗を非公開にする操作と、削除する操作はありません。掲載をやめるときは、店舗ページから取り下げを申し立ててください。
          </Notice>
        </section>
      </form>
    </ShopPage>
  );
}
