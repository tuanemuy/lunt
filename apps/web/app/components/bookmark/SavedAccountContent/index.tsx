import { loadAccountSavedFrom } from "@/presentation/bookmarkData";
import { SavedBoard } from "../SavedBoard";

const ACCOUNT = { mode: "account" } as const;

/** VW-10 「アカウントの保存」: the first page, read on the server; the board loads the rest. */
export async function SavedAccountContent() {
  const first = await loadAccountSavedFrom(0);
  return <SavedBoard source={ACCOUNT} first={first} />;
}
