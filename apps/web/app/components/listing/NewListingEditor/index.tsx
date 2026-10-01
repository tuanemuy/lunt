"use client";

import { useNavigate, useRouter } from "@tanstack/react-router";
import { useRef, useState, useTransition } from "react";
import { ManageBody, ManageStatus } from "@/components/layout/ManageShell";
import { ShopPage } from "@/components/manage/ShopShell";
import { usePlaceFrame } from "@/components/manage/ShopShell/usePlaceFrame";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { HydrationGate } from "@/components/ui/HydrationGate";
import { classifyError } from "@/presentation/errorState";
import { createListingDraftFn } from "@/presentation/listing";
import {
  EMPTY_LISTING_FORM,
  type ListingFormValues,
  listingFieldErrors,
  REPICK_CODES,
  toListingContent,
} from "@/presentation/listingForm";
import type { CategoryOption } from "@/presentation/listingView";
import { newId } from "@/presentation/newId";
import { useReconcile } from "@/presentation/reconcile";
import {
  type ListingFailure,
  ListingFailureAlert,
} from "../ListingFailureAlert";
import { ListingFormFields } from "../ListingFormFields";

/** `createListingDraft`'s answer when the id already holds another listing. */
const LISTING_ID_CONFLICT = "LISTING_ID_CONFLICT";

/**
 * SM-04 新規 (LST-01, LST-15): an empty listing of the store. Only saving
 * is offered; the saved draft opens in SM-04 for the preview and publish.
 * The create is idempotent on the id minted for this entry, kept until the
 * save is known to have gone through, so a lost answer is resent as a
 * replay and an edited resend of a stored save is told apart (CS-08).
 */
export function NewListingEditor({
  categories,
  place,
}: {
  categories: readonly CategoryOption[];
  place: Readonly<{
    id: string;
    name: string;
    address: string;
    regions: readonly string[];
  }>;
}) {
  const frame = usePlaceFrame();
  const router = useRouter();
  const navigate = useNavigate();
  const proxy = frame.basis === "proxy";
  const reconcile = useReconcile();
  const [values, setValues] = useState<ListingFormValues>(EMPTY_LISTING_FORM);
  const [failure, setFailure] = useState<ListingFailure | null>(null);
  const [lostAccess, setLostAccess] = useState(false);
  const [saving, startSave] = useTransition();
  const attemptId = useRef<string | null>(null);
  const [taken, setTaken] = useState<string | null>(null);

  const save = () =>
    startSave(async () => {
      const content = toListingContent(values);
      attemptId.current ??= newId();
      const id = attemptId.current;
      setFailure(null);
      try {
        const { listingId } = await createListingDraftFn({
          data: { listingId: id, placeId: place.id, content },
        });
        attemptId.current = null;
        await navigate({
          to: "/manage/places/$placeId/listings/$listingId",
          params: { placeId: place.id, listingId },
          search: { created: true },
          replace: true,
        });
      } catch (error) {
        const state = classifyError(error);
        if (state.kind === "conflict" && state.code === LISTING_ID_CONFLICT) {
          setTaken(id);
          return;
        }
        if (state.kind === "forbidden" && !proxy) {
          setLostAccess(true);
          router.clearCache();
          return;
        }
        setFailure({
          state,
          fields: listingFieldErrors(state),
          attempt: "save",
        });
        if (
          state.kind === "premiseChanged" &&
          state.code !== null &&
          REPICK_CODES[state.code] !== undefined
        ) {
          // CS-08 for a retired category: keep the input, clear the retired
          // choice, and reload the active categories to pick from.
          setValues((current) => ({ ...current, categoryId: "" }));
          await reconcile();
        }
      }
    });

  if (lostAccess) {
    return (
      <ShopPage frame={frame} heading="掲載を追加">
        <ManageBody>
          <FocusOnMount role="alert">
            <EmptyPanel
              title="この店舗の店舗管理者ではありません"
              actions={<ButtonLink to="/me">マイページへ</ButtonLink>}
            >
              掲載の追加は、店舗管理者だけが行えます。下書きは保存していません。
            </EmptyPanel>
          </FocusOnMount>
        </ManageBody>
      </ShopPage>
    );
  }

  return (
    <ShopPage
      frame={frame}
      heading="掲載を追加"
      actions={
        <Button type="submit" form="listing-form" disabled={saving}>
          {saving ? "保存しています…" : "下書きを保存"}
        </Button>
      }
      actionsNote={
        JSON.stringify(values) === JSON.stringify(EMPTY_LISTING_FORM)
          ? "保存すると下書きになり、続けて公開前の確認と公開へ進めます。"
          : "保存していない変更があります。保存せずに画面を離れると、変更は残りません。"
      }
    >
      <form
        className="m-body"
        id="listing-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <HydrationGate>
          <ManageStatus tone="neutral">{`新規 · ${place.name}`}</ManageStatus>
          {taken === null ? null : (
            <Alert
              title="この下書きは、すでに保存されていました"
              actions={
                <ButtonLink
                  variant="secondary"
                  to="/manage/places/$placeId/listings/$listingId"
                  params={{ placeId: place.id, listingId: taken }}
                >
                  保存された下書きを開く
                </ButtonLink>
              }
            >
              通信が途切れる前の保存が届いていました。そのあとに変えた内容は保存していません。保存された下書きを開いて、続きを編集してください。
            </Alert>
          )}
          {failure === null ? null : (
            <ListingFailureAlert
              failure={failure}
              placeId={place.id}
              proxy={proxy}
              busy={saving}
              onReload={() => setFailure(null)}
              retry={
                <Button type="submit" variant="secondary" disabled={saving}>
                  もう一度保存
                </Button>
              }
            />
          )}
          <ListingFormFields
            values={values}
            onChange={(change) =>
              setValues((current) => ({ ...current, ...change }))
            }
            errors={failure?.fields ?? {}}
            categories={categories}
            place={place}
            disabled={saving}
          />
        </HydrationGate>
      </form>
    </ShopPage>
  );
}
