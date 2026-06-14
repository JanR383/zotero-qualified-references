/**
 * Typed facades for Zotero APIs not (yet) covered by zotero-types, so the rest
 * of the code base doesn't need scattered `as any` casts. One cast lives here;
 * shapes follow the Zotero source (chrome/content/zotero/xpcom/…).
 */

interface ReaderEvent {
  reader: { itemID: number };
  // `ids` = all selected annotations; `currentID` = the one actually
  // right-clicked (the menu's target). Use currentID for per-annotation actions.
  params: { ids?: string[]; currentID?: string };
  append: (entry: { label: string; onCommand: () => void }) => void;
}

interface ZoteroExtras {
  Reader: {
    open(
      itemID: number,
      location?: { annotationID?: string } | null,
      options?: object,
    ): Promise<unknown>;
    registerEventListener(
      type: string,
      handler: (event: ReaderEvent) => void,
      pluginID?: string,
    ): void;
    unregisterEventListener(
      type: string,
      handler: (event: ReaderEvent) => void,
    ): void;
  };
  MenuManager: {
    registerMenu(options: object): boolean;
    unregisterMenu(menuID: string): boolean;
  };
  ItemTypes: {
    getLocalizedString(itemType: string): string;
  };
  Date: {
    strToDate(str: string): { year?: number } | null;
  };
  Items: {
    getAsync(ids: number[]): Promise<Zotero.Item[]>;
    loadDataTypes(items: Zotero.Item[], types: string[]): Promise<void>;
  };
}

function z(): ZoteroExtras {
  return Zotero as unknown as ZoteroExtras;
}

export const zReader = (): ZoteroExtras["Reader"] => z().Reader;
export const zMenuManager = (): ZoteroExtras["MenuManager"] | undefined =>
  z().MenuManager;
export const zItemTypes = (): ZoteroExtras["ItemTypes"] => z().ItemTypes;
export const zDate = (): ZoteroExtras["Date"] => z().Date;
export const zItems = (): ZoteroExtras["Items"] =>
  Zotero.Items as unknown as ZoteroExtras["Items"];
export type { ReaderEvent };
