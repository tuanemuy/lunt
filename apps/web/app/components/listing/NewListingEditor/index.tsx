"use client";

import { useNavigate, useRouter } from "@tanstack/react-router";
import { useRef, useState, useTransition } from "react";
import { ManageBody, ManageStatus } from "@/components/layout/ManageShell";
import { ShopPage } from "@/components/manage/ShopShell";
import { usePlaceFrame } from "@/components/manage/ShopShell/usePlaceFrame";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { classifyError } from "@/presentation/errorState";
import { createListingDraftFn } from "@/presentation/listing";
import {
  EMPTY_LISTING_FORM,
  type ListingFormValues,
  listingFieldErrors,
  toListingContent,
} from "@/presentation/listingForm";
import type { CategoryOption } from "@/presentation/listingView";
import { newId } from "@/presentation/newId";
import {
  type ListingFailure,
  ListingFailureAlert,
} from "../ListingFailureAlert";
import { ListingFormFields } from "../ListingFormFields";

/** The save whose outcome is not known to be final, resent with the same id. */
type Attempt = { id: string; key: string };

/**
 * SM-04 新規 (LST-01, LST-15): an empty listing of the store. Only saving
 * is offered; the saved draft opens in SM-04 for the preview and publish.
 * The create is idempotent on the id minted for this content, so a lost
 * answer is resent as a replay.
 */
export function NewListingEditor({
  categories,
  place,
}: {
  categories: readonly CategoryOption[];
  place: Readonly<{ id: string; name: string; address: string }>;
}) {
  const frame = usePlaceFrame();
  const router = useRouter();
  const navigate = useNavigate();
  const proxy = frame.basis === "proxy";
  const [values, setValues] = useState<ListingFormValues>(EMPTY_LISTING_FORM);
  const [failure, setFailure] = useState<ListingFailure | null>(null);
  const [lostAccess, setLostAccess] = useState(false);
  const [saving, startSave] = useTransition();
  const attempt = useRef<Attempt | null>(null);

  const save = () =>
    startSave(async () => {
      const content = toListingContent(values);
      const key = JSON.stringify(content);
      if (attempt.current?.key !== key) {
        attempt.current = { id: newId(), key };
      }
      try {
        const { listingId } = await createListingDraftFn({
          data: { listingId: attempt.current.id, placeId: place.id, content },
        });
        attempt.current = null;
        await navigate({
          to: "/manage/places/$placeId/listings/$listingId",
          params: { placeId: place.id, listingId },
          search: { created: true },
          replace: true,
        });
      } catch (error) {
        const state = classifyError(error);
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
      actionsNote="保存すると下書きになり、続けて公開前の確認と公開へ進めます。"
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
        <ManageStatus tone="neutral">{`新規 · ${place.name}`}</ManageStatus>
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
      </form>
    </ShopPage>
  );
}
