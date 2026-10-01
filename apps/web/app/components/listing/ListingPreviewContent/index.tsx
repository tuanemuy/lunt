import { loadListingPreview } from "@/presentation/listingData";
import { ListingPreview } from "../ListingPreview";

/**
 * CM-03's preview, read on the server before its body streams;
 * `ListingPreview` owns the publish. A missing listing (CS-17) throws here,
 * so the route fails and the document answers 404.
 */
export async function readListingPreview(placeId: string, listingId: string) {
  const data = await loadListingPreview(placeId, listingId);
  return <ListingPreview key={data.id} data={data} />;
}
