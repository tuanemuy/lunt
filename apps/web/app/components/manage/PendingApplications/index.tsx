import { ManageSection } from "@/components/layout/ManageShell";
import { Badge } from "@/components/ui/Badge";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import { TextLink } from "@/components/ui/TextButton";
import { applicationPath } from "@/presentation/applyView";
import type { PendingApplicationItem } from "@/presentation/shopRelations";

/**
 * The store's applications in progress on SM-05 / SM-06 (「申請の状態」:
 * the row and its status only), each leading to its MY-05, and MY-04
 * narrowed to the store for all of them.
 */
export function PendingApplications({
  id,
  title,
  empty,
  help,
  items,
  placeId,
}: {
  id: string;
  title: string;
  empty: string;
  help?: string;
  items: readonly PendingApplicationItem[];
  placeId: string;
}) {
  return (
    <ManageSection id={id} title={title}>
      {items.length === 0 ? (
        <p className="m-field__help">{empty}</p>
      ) : (
        <LinkList>
          {items.map((item) => (
            <li key={item.applicationId}>
              <ListRowLink
                to={applicationPath(item.applicationId)}
                title={item.title}
                meta={item.meta}
                end={<Badge tone={item.tone}>{item.status}</Badge>}
              />
            </li>
          ))}
        </LinkList>
      )}
      {help === undefined || items.length === 0 ? null : (
        <p className="m-field__help">{help}</p>
      )}
      <TextLink to="/me/applications" search={{ place: placeId }}>
        この店舗の申請をすべて見る
      </TextLink>
    </ManageSection>
  );
}
