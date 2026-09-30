import { defineConfig } from "zotero-plugin-scaffold";
import pkg from "./package.json";

export default defineConfig({
  source: ["src", "addon"],
  dist: ".scaffold/build",
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  updateURL: `https://github.com/{{owner}}/{{repo}}/releases/download/release/${
    pkg.version.includes("-") ? "update-beta.json" : "update.json"
  }`,
  xpiDownloadLink:
    "https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi",

  build: {
    assets: ["addon/**/*.*"],
    define: {
      ...pkg.config,
      author: pkg.author,
      description: pkg.description,
      homepage: pkg.homepage,
      buildVersion: pkg.version,
      buildTime: "{{buildTime}}",
    },
    prefs: {
      prefix: pkg.config.prefsPrefix,
    },
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        target: "firefox140",
        // Preserve third-party licence notices (zotero-plugin-toolkit, MIT)
        // in a sibling .LEGAL.txt file instead of stripping them on minify.
        legalComments: "linked",
        outfile: `.scaffold/build/addon/content/scripts/${pkg.config.addonRef}.js`,
      },
      {
        // Separate bundle for the standalone graph window (M5). force-graph
        // (MIT) is bundled in here so the main plugin bundle stays lean.
        // legalComments: "linked" preserves third-party MIT notices in a
        // sibling .LEGAL.txt file, satisfying the licence's attribution clause.
        entryPoints: ["src/graph/index.ts"],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        target: "firefox140",
        platform: "browser",
        format: "iife",
        legalComments: "linked",
        outfile: `.scaffold/build/addon/content/scripts/graph.js`,
      },
      {
        // Separate bundle for the standalone reference-list window (N3).
        // Plain HTML/CSS, no third-party lib.
        entryPoints: ["src/list/index.ts"],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        target: "firefox140",
        platform: "browser",
        format: "iife",
        legalComments: "linked",
        outfile: `.scaffold/build/addon/content/scripts/list.js`,
      },
    ],
  },

  test: {
    waitForPlugin: `() => Zotero.${pkg.config.addonInstance}.data.initialized`,
  },

  // If you need to see a more detailed log, uncomment the following line:
  // logLevel: "trace",
});
