import { handlePossibleGroupCopy } from "./groupCopyGuard";
import { refreshSectionIfVisible } from "./referenceSection";
import { itemForIndexKey, onItemChanged, rebuildIndex } from "./storage";
import { log } from "../utils/log";

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
      const affected = new Set<string>();
      for (const id of ids) {
        try {
          for (const key of onItemChanged(Number(id), removed)) {
            affected.add(key);
          }
        } catch (e) {
          log(`QRef: notifier error for item ${id}`, e);
        }
      }
      refreshTargets(affected);
      // Privacy guard: a personal item copied into a group fires `add` with the
      // cloned Extra (incl. references) already present. Drop them unless the
      // user opted in. Fire-and-forget; notify() is sync.
      if (event === "add") {
        for (const id of ids) {
          void handlePossibleGroupCopy(Number(id)).catch((e) =>
            log(`QRef: group-copy guard failed for ${id}`, e),
          );
        }
      }
    },
  };
  notifierID = Zotero.Notifier.registerObserver(callback, ["item"], "qref");
  return rebuildIndex();
}

/**
 * A source change alters what its targets show (the "Referenced by" list and
 * the Ref. (+)/(−) columns) without modifying the targets, so Zotero redraws
 * neither. Re-render their open panes, and send the item trees a "refresh",
 * which drops the cached cell values of those rows. The observer above ignores
 * "refresh", so this cannot loop.
 */
function refreshTargets(keys: Set<string>): void {
  const ids: number[] = [];
  for (const key of keys) {
    const target = itemForIndexKey(key);
    if (target) ids.push(target.id);
  }
  if (ids.length === 0) return;
  for (const id of ids) {
    try {
      refreshSectionIfVisible(id);
    } catch (e) {
      log(`QRef: refreshing pane of item ${id} failed`, e);
    }
  }
  void Zotero.Notifier.trigger("refresh", "item", ids).catch((e: unknown) =>
    log("QRef: item tree refresh failed", e),
  );
}

export function unregisterNotifier(): void {
  if (notifierID) {
    Zotero.Notifier.unregisterObserver(notifierID);
    notifierID = undefined;
  }
}
