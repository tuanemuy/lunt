import { loadMyPage } from "@/presentation/myPageData";
import { MyPageView } from "../MyPageView";

/** MY-01's body, rendered on the server from the session's account. */
export async function MyPageContent() {
  return <MyPageView data={await loadMyPage()} />;
}
