/**
 * How viewers' and managers' screens fetch a photo's content. Only
 * `PhotoStorage.displayRefs` returns one; the domain does not read it.
 */
export type PhotoDisplayRef = Readonly<{ url: string }>;
