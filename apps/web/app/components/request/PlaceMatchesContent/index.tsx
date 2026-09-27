import { loadPlaceMatches } from "@/presentation/findPlaceData";
import { PlaceMatchList } from "../PlaceMatchList";

/** RQ-01's first page of results, rendered on the server. */
export async function PlaceMatchesContent({
  name,
  address,
}: {
  name: string | null;
  address: string | null;
}) {
  const first = await loadPlaceMatches({ name, address, page: 1 });
  return <PlaceMatchList name={name} address={address} first={first} />;
}
