import { MY_APPLICATIONS_PAGE_SIZE } from "@/presentation/myApplications";
import { loadMyApplicationsPage } from "@/presentation/myApplicationsData";
import { MyApplicationList } from "../MyApplicationList";

/** MY-04's first page, rendered on the server; the list loads the rest. */
export async function MyApplicationsContent({
  place,
}: {
  place: string | null;
}) {
  const first = await loadMyApplicationsPage(place, {
    page: 1,
    limit: MY_APPLICATIONS_PAGE_SIZE,
  });
  return <MyApplicationList first={first} />;
}
