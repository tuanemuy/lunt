import {
  httpStatusFor,
  redactForClient,
  serializeError,
} from "../presentation/errorResponse";

export const PROVISION_CATEGORIES_ROUTE = "POST /__ops/categories/provision";

/**
 * `POST /__ops/categories/provision` — the opening procedure's step that
 * puts the four initial categories into the empty catalog
 * (`provisionInitialCategories`, run next to
 * `POST /__ops/operators/establish`). No body. Answers
 * `{ "provisioned": true }` when it wrote the catalog and
 * `{ "provisioned": false }` when the catalog already had categories —
 * resending is safe. A concurrent run that lost the race answers 409.
 *
 * The caller (`handleOpsRequest`) has already checked the `OPS_TOKEN`
 * bearer token and matched the route.
 */
export async function handleCategoryProvisioning(
  provision: () => Promise<Readonly<{ provisioned: boolean }>>,
): Promise<Response> {
  try {
    return Response.json(await provision());
  } catch (error) {
    const serialized = serializeError(error);
    return Response.json(
      { error: redactForClient(serialized) },
      { status: httpStatusFor(serialized) },
    );
  }
}
