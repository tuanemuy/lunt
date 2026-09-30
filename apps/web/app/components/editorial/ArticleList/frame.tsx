"use client";

import type { ReactNode } from "react";
import { ManagePage } from "@/components/layout/ManageShell";
import { ButtonLink } from "@/components/ui/Button";
import { EditorialTitle } from "../EditorialShell";

const NEW_ARTICLE = "/editorial/articles/new";

/**
 * AM-01's page: the title band with 新しい読みもの beside the heading from
 * `lg`, and in the dock on phones.
 */
export function ArticleListFrame({
  children,
  withCreate = true,
}: {
  children: ReactNode;
  withCreate?: boolean;
}) {
  return (
    <ManagePage
      title={
        <EditorialTitle heading="読みものの一覧" back={false}>
          {withCreate ? (
            <ButtonLink to={NEW_ARTICLE} className="am01-create">
              ＋ 新しい読みもの
            </ButtonLink>
          ) : null}
        </EditorialTitle>
      }
      {...(withCreate
        ? {
            actions: (
              <div className="am01-dock-actions">
                <ButtonLink to={NEW_ARTICLE}>＋ 新しい読みもの</ButtonLink>
              </div>
            ),
          }
        : {})}
    >
      {children}
    </ManagePage>
  );
}
