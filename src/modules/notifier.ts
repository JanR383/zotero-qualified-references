import { handlePossibleGroupCopy } from "./groupCopyGuard";
import { onItemChanged, rebuildIndex } from "./storage";

let notifierID: string | undefined;

const HANDLED = new Set(["add", "modify", "trash", "delete"]);

/**
 * Register the Notifier observer, then build the reverse index in the
 * background. The rebuild is returned (not awaited here) so startup is not
 * blocked on large databases. Incremental events that arrive while the rebuild
 * is in flight keep the (initially empty) index fresh; addSourceToIndex is
 * idempotent per source, so the rebuild re-indexing the same item is safe.
 */
export function initIndexAndNotifier(): Promise<void> {
  const callback = {
    notify: (
      event: string,
      type: string,
      ids: Array<string | number>,
      _extraData: { [key: string]: any },
    ) => {
      if (!addon?.data.alive) {
        unregisterNotifier();
        return;
      }
      if (type !== "item" || !HANDLED.has(event)) return;
      const removed = event === "delete";
      for (const id of ids) {
        try {
          onItemChanged(Number(id), removed);
        } catch (e) {
          ztoolkit.log(`QRef: notifier error for item ${id}`, e);
        }
      }
      // Privacy guard: a personal item copied into a group fires `add` with the
      // cloned Extra (incl. references) already present. Drop them unless the
      // user opted in. Fire-and-forget; notify() is sync.
      if (event === "add") {
        for (const id of ids) {
          void handlePossibleGroupCopy(Number(id)).catch((e) =>
            ztoolkit.log(`QRef: group-copy guard failed for ${id}`, e),
          );
        }
      }
    },
  };
  notifierID = Zotero.Notifier.registerObserver(callback, ["item"], "qref");
  return rebuildIndex();
}

export function unregisterNotifier(): void {
  if (notifierID) {
    Zotero.Notifier.unregisterObserver(notifierID);
    notifierID = undefined;
  }
}
