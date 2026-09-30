import { config } from "../package.json";
import hooks from "./hooks";
import type { IncomingLink } from "./modules/types";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    // Env type, see build.js
    env: "development" | "production";
    initialized?: boolean;
    locale?: {
      current: any;
    };
    // In-memory reverse index: targetKey -> incoming links pointing at it.
    // Built at startup, kept fresh by the notifier. See modules/storage.ts.
    incomingIndex: Map<string, IncomingLink[]>;
    // Secondary index: sourceID -> the target index-keys it contributes to, so
    // removing a source is O(its targets) instead of O(whole index).
    incomingBySource: Map<number, Set<string>>;
  };
  // Lifecycle hooks
  public hooks: typeof hooks;
  // APIs
  public api: object;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      incomingIndex: new Map(),
      incomingBySource: new Map(),
    };
    this.hooks = hooks;
    this.api = {};
  }
}

export default Addon;
