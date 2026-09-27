"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/ChipButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Fieldset } from "@/components/ui/Field";
import { classifyError } from "@/presentation/errorState";
import type { Framing } from "@/presentation/listingView";
import { newId } from "@/presentation/newId";
import { PHOTO_MAX_BYTES, uploadPhotoFn } from "@/presentation/photoUpload";
import { FramedPhoto } from "../FramedPhoto";
import { FramingDialog } from "./FramingDialog";

export type PhotoFieldItem = Readonly<{
  photoId: string;
  url: string | null;
  framing: Framing | null;
}>;

type PhotoFieldProps = {
  /** The fieldset's id, the target of 「写真を登録する」 links (CS-16, CS-10). */
  id: string;
  items: readonly PhotoFieldItem[];
  onChange: (items: readonly PhotoFieldItem[]) => void;
  /** `publish` (公開に必須) on listings; stores' photos are optional. */
  requirement: "optional" | "publish";
  addLabel: string;
  help: string;
  /** Offer 範囲 (見せる範囲) per photo: listings only (CF-01). */
  withFraming?: boolean;
  error?: string;
  disabled?: boolean;
};

/** The upload whose outcome is not known to be final, resent with the same id. */
type Attempt = { id: string; file: File };

/**
 * CF-01 写真の登録: the photos in display order (the first is the cover),
 * moved up and removed in place; each addition registers one file after
 * the consent is given. Order and removal take effect when the screen
 * saves.
 */
export function PhotoField({
  id,
  items,
  onChange,
  requirement,
  addLabel,
  help,
  withFraming = false,
  error,
  disabled = false,
}: PhotoFieldProps) {
  const [adding, setAdding] = useState(false);
  const [framingIndex, setFramingIndex] = useState<number | null>(null);
  const framed = framingIndex === null ? undefined : items[framingIndex];

  const move = (index: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    if (item === undefined) return;
    next.splice(index - 1, 0, item);
    onChange(next);
  };
  const remove = (index: number) =>
    onChange(items.filter((_, i) => i !== index));

  return (
    <Fieldset
      id={id}
      legend="写真"
      requirement={requirement}
      {...(error === undefined ? {} : { error })}
      help={help}
    >
      {items.length === 0 ? null : (
        <ul className="m-photos">
          {items.map((item, index) => {
            const ordinal = `${index + 1}枚目`;
            return (
              <li className="m-photos__item" key={item.photoId}>
                <FramedPhoto
                  url={item.url}
                  framing={item.framing}
                  alt=""
                  ratio={1}
                  className="m-photos__thumb"
                />
                <span className="m-photos__text">
                  <span className="m-row__name">{ordinal}</span>
                  {index === 0 ? (
                    <span className="m-row__meta">代表写真</span>
                  ) : null}
                </span>
                <span className="m-photos__ops">
                  {withFraming ? (
                    <ChipButton
                      aria-label={`${ordinal}の見せる範囲を調整`}
                      disabled={disabled || item.url === null}
                      onClick={() => setFramingIndex(index)}
                    >
                      範囲
                    </ChipButton>
                  ) : null}
                  <ChipButton
                    aria-label={`${ordinal}を前へ`}
                    disabled={disabled || index === 0}
                    onClick={() => move(index)}
                  >
                    前へ
                  </ChipButton>
                  <ChipButton
                    aria-label={`${ordinal}を外す`}
                    disabled={disabled}
                    onClick={() => remove(index)}
                  >
                    外す
                  </ChipButton>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => setAdding(true)}
      >
        {addLabel}
      </Button>
      <PhotoUploadDialog
        open={adding}
        onClose={() => setAdding(false)}
        onUploaded={(photo) => {
          onChange([...items, { ...photo, framing: null }]);
          setAdding(false);
        }}
      />
      {framed === undefined || framingIndex === null ? null : (
        <FramingDialog
          key={framed.photoId}
          ordinal={`${framingIndex + 1}枚目`}
          url={framed.url}
          framing={framed.framing}
          onCancel={() => setFramingIndex(null)}
          onConfirm={(framing) => {
            onChange(
              items.map((item, i) =>
                i === framingIndex ? { ...item, framing } : item,
              ),
            );
            setFramingIndex(null);
          }}
        />
      )}
    </Fieldset>
  );
}

function PhotoUploadDialog({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: (photo: Readonly<{ photoId: string; url: string }>) => void;
}) {
  const fileId = useId();
  const consentId = useId();
  const errorId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const attempt = useRef<Attempt | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setAgreed(false);
    setMessage(null);
    attempt.current = null;
    if (fileInput.current !== null) fileInput.current.value = "";
  };

  const upload = () => {
    if (file === null) {
      setMessage("写真を選んでください");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setMessage("写真は10MBまでのファイルを選んでください");
      return;
    }
    if (!agreed) {
      setMessage(
        "写真を登録するには、自ら撮影した写真または許諾を得た写真であることと、Lunt での利用に同意してください",
      );
      return;
    }
    if (attempt.current?.file !== file) {
      attempt.current = { id: newId(), file };
    }
    const { id } = attempt.current;
    startUpload(async () => {
      const form = new FormData();
      form.set("photoId", id);
      form.set("agreed", "true");
      form.set("file", file);
      try {
        const photo = await uploadPhotoFn({ data: form });
        reset();
        onUploaded(photo);
      } catch (error) {
        const state = classifyError(error);
        setMessage(
          state.kind === "failed"
            ? "登録できませんでした。通信を確かめて、もう一度登録してください"
            : state.kind === "invalidInput"
              ? (Object.values(state.fieldErrors).flat()[0] ?? state.message)
              : state.message,
        );
      }
    });
  };

  return (
    <ConfirmDialog
      open={open}
      title="写真を追加"
      confirmLabel={uploading ? "登録しています…" : "登録する"}
      pending={uploading}
      onConfirm={upload}
      onCancel={() => {
        reset();
        onClose();
      }}
    >
      <div className="m-field">
        <label className="m-field__label" htmlFor={fileId}>
          写真のファイル
        </label>
        <input
          ref={fileInput}
          id={fileId}
          className="m-file"
          type="file"
          accept="image/*"
          aria-describedby={message === null ? undefined : errorId}
          onChange={(event) => {
            setFile(event.currentTarget.files?.[0] ?? null);
            setMessage(null);
          }}
        />
        <p className="m-field__help">
          JPEG・PNG・WebP の静止画を、10MBまで登録できます。
        </p>
      </div>
      <label className="m-consent" htmlFor={consentId}>
        <input
          id={consentId}
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.currentTarget.checked)}
        />
        <span>
          自分で撮影した写真、または撮影した人から利用の許諾を得た写真です。Lunt
          での利用に同意します。
        </span>
      </label>
      {message === null ? null : (
        <p className="m-field__error" id={errorId} role="alert">
          {message}
        </p>
      )}
    </ConfirmDialog>
  );
}
