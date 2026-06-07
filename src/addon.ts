import { config } from "../package.json";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import type { IncomingLink } from "./modules/types";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    // Env type, see build.js
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    // In-memory reverse index: targetKey -> incoming links pointing at it.
    // Built at startup, kept fresh by the notifier. See modules/storage.ts.
    incomingIndex: Map<string, IncomingLink[]>;
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
      ztoolkit: createZToolkit(),
      incomingIndex: new Map(),
    };
    this.hooks = hooks;
    this.api = {};
  }
}

export default Addon;
