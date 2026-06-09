/** Stance of a reference, stored as a signed integer. */
export type Stance = -2 | -1 | 0 | 1 | 2;

/**
 * A single directed reference from the source item (where it is stored, in the
 * source item's "Extra" field) to a target item. Multiple records may point at
 * the same target; records are identified by `id`, never by `targetKey`.
 */
export interface ReferenceLink {
  id: string;
  targetKey: string;
  targetLib: number;
  sourcePages?: string;
  targetPages?: string;
  /**
   * Optional PDF anchor in the SOURCE item (M6): the passage in A's PDF that
   * cites the target. Created from the reader's annotation context menu; the
   * source page is auto-filled into sourcePages. Lives in the source library.
   */
  sourceAttachmentKey?: string; // PDF attachment item key (in the source library)
  sourceAnnotationKey?: string; // annotation item key within that attachment
  stance: Stance;
  comment?: string;
  added: string;
  modified: string;
}

/** A reference as seen from the target item (for the read-only reverse view). */
export interface IncomingLink {
  sourceID: number;
  sourceKey: string;
  sourceLib: number;
  link: ReferenceLink;
}
