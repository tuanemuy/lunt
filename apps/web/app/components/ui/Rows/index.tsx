import { createLink } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../cx";
import { Icon } from "../Icon";

/** A vertical list of photo rows (`Row`/`RowLink`), 24px apart. */
export function Rows({ children }: { children: ReactNode }) {
  return <ul className="m-rows">{children}</ul>;
}

type RowContentProps = {
  /** An 88px square; `null` draws the paper placeholder of an object without a photo. */
  photo: { src: string; alt: string } | null;
  name: ReactNode;
  meta?: ReactNode;
  sub?: ReactNode;
};

function RowContent({ photo, name, meta, sub }: RowContentProps) {
  return (
    <>
      <span className="m-row__photo">
        {photo === null ? null : (
          <img src={photo.src} alt={photo.alt} loading="lazy" />
        )}
      </span>
      <span className="m-row__content">
        <span className="m-row__name">{name}</span>
        {meta === undefined ? null : (
          <span className="m-row__meta">{meta}</span>
        )}
        {sub === undefined ? null : <span className="m-row__sub">{sub}</span>}
      </span>
    </>
  );
}

/** A photo row (Row 73:3357, the management form of Lunt/ContentRow). Place inside `Rows` as `<li>`. */
export function Row(props: RowContentProps) {
  return (
    <div className="m-row">
      <RowContent {...props} />
    </div>
  );
}

function RowAnchor({
  photo,
  name,
  meta,
  sub,
  className,
  ...rest
}: Omit<ComponentProps<"a">, "children"> & RowContentProps) {
  return (
    <a className={cx("m-row", className)} {...rest}>
      <RowContent
        photo={photo}
        name={name}
        {...(meta === undefined ? {} : { meta })}
        {...(sub === undefined ? {} : { sub })}
      />
    </a>
  );
}

/** A photo row that opens its object. */
export const RowLink = createLink(RowAnchor);

/** A ruled list of text rows (`ListRow`/`ListRowLink`). */
export function LinkList({ children }: { children: ReactNode }) {
  return <ul className="m-list">{children}</ul>;
}

type ListRowContentProps = {
  title: ReactNode;
  meta?: ReactNode;
  /** Trailing content before the chevron (a badge, a count). */
  end?: ReactNode;
};

function ListRowContent({
  title,
  meta,
  end,
  chevron,
}: ListRowContentProps & { chevron: boolean }) {
  return (
    <>
      <span className="m-list__text">
        <span className="m-list__title">{title}</span>
        {meta === undefined ? null : (
          <span className="m-list__meta">{meta}</span>
        )}
      </span>
      {end === undefined && !chevron ? null : (
        <span className="m-list__end">
          {end}
          {chevron ? <Icon name="chevron" /> : null}
        </span>
      )}
    </>
  );
}

/** A static text row of a `LinkList`. */
export function ListRow(props: ListRowContentProps) {
  return (
    <div className="m-list__item">
      <ListRowContent {...props} chevron={false} />
    </div>
  );
}

function ListRowAnchor({
  title,
  meta,
  end,
  className,
  ...rest
}: Omit<ComponentProps<"a">, "children" | "title"> & ListRowContentProps) {
  return (
    <a className={cx("m-list__item", className)} {...rest}>
      <ListRowContent
        title={title}
        {...(meta === undefined ? {} : { meta })}
        {...(end === undefined ? {} : { end })}
        chevron
      />
    </a>
  );
}

/** A text row with a chevron that opens its destination. */
export const ListRowLink = createLink(ListRowAnchor);
