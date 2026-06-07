import { onItemChanged, rebuildIndex } from "./storage";

let notifierID: string | undefined;

const HANDLED = new Set(["add", "modify", "trash", "delete"]);

/** Build the reverse index once, then keep it fresh via a Notifier observer. */
export async function initIndexAndNotifier(): Promise<void> {
  await rebuildIndex();
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
      for (const id of ids) onItemChanged(Number(id), removed);
    },
  };
  notifierID = Zotero.Notifier.registerObserver(callback, ["item"], "qref");
}

export function unregisterNotifier(): void {
  if (notifierID) {
    Zotero.Notifier.unregisterObserver(notifierID);
    notifierID = undefined;
  }
}
