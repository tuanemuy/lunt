"use client";

import type { ReactNode } from "react";
import { ManageSection } from "@/components/layout/ManageShell";
import { FramedPhoto } from "@/components/photo/FramedPhoto";
import { Badge } from "@/components/ui/Badge";
import { TextLink } from "@/components/ui/TextButton";
import type {
  AttachedLine,
  ComparedRow,
  ContentData,
  ContentPhoto,
  ContentRow,
  ContentValue,
  SubjectItem,
} from "@/presentation/applicationContent";

/*
 * The pieces MY-05 and CM-01 both draw from an application's content:
 * the photo strip, the item list, a revision's changed items against the
 * target now, and the subjects with where they open.
 */

function Thumb({ photo, index }: { photo: ContentPhoto; index: number }) {
  const alt =
    photo.note === null
      ? `${index + 1}枚目${index === 0 ? "（代表写真）" : ""}`
      : `${index + 1}枚目（${photo.note}）`;
  return (
    <span
      className="cm01-thumb"
      {...(photo.note === null ? {} : { "data-removed": "" })}
    >
      <FramedPhoto
        url={photo.url}
        framing={photo.framing}
        alt={alt}
        ratio={1}
        className="photo-thumb"
      />
      {photo.note === null ? null : <Badge tone="alert">{photo.note}</Badge>}
    </span>
  );
}

function Thumbs({ photos }: { photos: readonly ContentPhoto[] }) {
  if (photos.length === 0) return <>（なし）</>;
  return (
    <span className="cm01-thumbs">
      {photos.map((photo, index) => (
        <Thumb key={photo.photoId} photo={photo} index={index} />
      ))}
    </span>
  );
}

type Variant = "my" | "cm";

/** One value of the content, drawn by its kind. */
export function ValueView({
  value,
  variant = "cm",
}: {
  value: ContentValue;
  variant?: Variant;
}): ReactNode {
  switch (value.kind) {
    case "photos":
      return <Thumbs photos={value.photos} />;
    case "quote":
      // The applicant reads their own words plainly; the reviewer, set off.
      return variant === "my" ? (
        value.text
      ) : (
        <span className="cm01-quote">{value.text}</span>
      );
    case "text":
      return value.sub === undefined ? (
        value.text
      ) : (
        <>
          {value.text}
          <span className="m-field__help">{value.sub}</span>
        </>
      );
    case "listings":
      return <AttachedLines lines={value.listings} />;
  }
}

/**
 * A participation's attached listings: those viewers see open DT-01;
 * the others say why viewers do not see them.
 */
function AttachedLines({ lines }: { lines: readonly AttachedLine[] }) {
  if (lines.length === 0) return <>（なし）</>;
  return (
    <ul className="cm01-attached">
      {lines.map((line) => (
        <li key={line.id}>
          {line.href === null ? (
            <span>{line.name}</span>
          ) : (
            <TextLink to={line.href}>{line.name}</TextLink>
          )}
          <span className="m-row__sub">
            {line.hidden
              ? line.name === line.state
                ? "閲覧者に表示されていません"
                : `${line.state}（閲覧者に表示されていません）`
              : line.state}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Items and values: `my-dl` (MY-05) or `cm01-dl` (CM-01). */
export function ContentList({
  rows,
  variant,
}: {
  rows: readonly ContentRow[];
  variant: Variant;
}) {
  return variant === "my" ? (
    <dl className="my-dl">
      {rows.map((row) => (
        <div key={row.label} className="my-dl__row">
          <dt>{row.label}</dt>
          <dd>
            <ValueView value={row.value} variant="my" />
          </dd>
        </div>
      ))}
    </dl>
  ) : (
    <dl className="cm01-dl">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            <ValueView value={row.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A revision's changed items: 現在 / 申請 inline (MY-05) or side by side (CM-01). */
export function CompareList({
  rows,
  variant,
}: {
  rows: readonly ComparedRow[];
  variant: Variant;
}) {
  if (variant === "my") {
    return (
      <dl className="my-dl">
        {rows.map((row) => (
          <div key={row.label} className="my-dl__row">
            <dt>{row.label}</dt>
            <dd>
              <span className="my05-cmp">
                <span className="my05-cmp__label">現在</span>
                <span className="my05-cmp__old">
                  <ValueView value={row.current} />
                </span>
                <span className="my05-cmp__label">申請</span>
                <span className="my05-cmp__new">
                  <ValueView value={row.proposed} />
                </span>
              </span>
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <div className="cm01-diff">
      {rows.map((row) => (
        <div key={row.label} className="cm01-diff__item">
          <p className="m-list__title">{row.label}</p>
          <div className="cm01-diff__pair">
            <div className="cm01-diff__side">
              <span className="cm01-diff__label">現在の値</span>
              <span className="cm01-diff__value">
                <ValueView value={row.current} />
              </span>
            </div>
            <div className="cm01-diff__side" data-side="new">
              <span className="cm01-diff__label">申請の値</span>
              <span className="cm01-diff__value">
                <ValueView value={row.proposed} />
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The content sections of an application: 申請した内容, or only the
 * changed items of a revision — against the target now while it is
 * decided, as 反映された内容 once approved (only the proposed values when
 * the listing is gone). The target with the items laid on is not part of
 * it: CM-01 shows it in the approval's confirmation alone.
 */
export function ContentSections({
  content,
  variant,
  idPrefix,
  approved,
}: {
  content: ContentData;
  variant: Variant;
  idPrefix: string;
  approved: boolean;
}) {
  const help = variant === "my" ? "my05-help" : "m-field__help";
  if (content.compare !== null && approved) {
    return (
      <ManageSection id={`${idPrefix}-reflected`} title="反映された内容">
        <p className={help}>
          承認で反映した項目です。変更しなかった項目は示していません。
        </p>
        <ContentList
          rows={content.compare.map((row) => ({
            label: row.label,
            value: row.proposed,
          }))}
          variant={variant}
        />
      </ManageSection>
    );
  }
  if (content.compare !== null) {
    return (
      <ManageSection id={`${idPrefix}-changes`} title="変更する項目">
        <p className={help}>
          変更する項目だけを、対象の現在の値と並べて示します。変更しない項目は示していません。
        </p>
        <CompareList rows={content.compare} variant={variant} />
      </ManageSection>
    );
  }
  return (
    <ManageSection
      id={`${idPrefix}-content`}
      title={variant === "my" ? "申請した内容" : "申請の内容"}
    >
      {content.targetGone ? (
        <p className={help}>
          対象の掲載は削除されています。現在の値との見比べはなく、申請の値だけを示します。
        </p>
      ) : null}
      <ContentList rows={content.rows} variant={variant} />
    </ManageSection>
  );
}

/** A subject's name with where it opens, and its note. */
export function SubjectValue({ subject }: { subject: SubjectItem }) {
  return (
    <>
      {subject.href === null ? (
        subject.name
      ) : (
        <TextLink to={subject.href}>{subject.name}</TextLink>
      )}
      {subject.note === null ? null : (
        <span className="m-row__sub">{subject.note}</span>
      )}
    </>
  );
}
