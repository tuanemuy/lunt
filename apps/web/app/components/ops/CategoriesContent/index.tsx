import { loadCategoryOptions } from "@/presentation/listingData";
import { CategoryBoard } from "../CategoryBoard";

/** OM-06's categories, read on the server; `CategoryBoard` owns the changes. */
export async function CategoriesContent() {
  return <CategoryBoard categories={await loadCategoryOptions()} />;
}
