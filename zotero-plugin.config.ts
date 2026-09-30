import { existsSync, readFileSync } from "node:fs";
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
        legalComments: "linked",
        outfile: `.scaffold/build/addon/content/scripts/${pkg.config.addonRef}.js`,
      },
      // Standalone windows, each its own bundle: graph (M5; force-graph, MIT,
      // stays out of the main script) and the reference list (N3).
      // legalComments: "linked" keeps third-party licence notices in a
      // sibling .LEGAL.txt file, as the MIT licence's attribution clause needs.
      ...["graph", "list"].map((name) => ({
        entryPoints: [`src/${name}/index.ts`],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        target: "firefox140",
        platform: "browser" as const,
        format: "iife" as const,
        legalComments: "linked" as const,
        outfile: `.scaffold/build/addon/content/scripts/${name}.js`,
      })),
    ],
  },

  release: {
    github: {
      // Hand-written notes in docs/releases/v<version>.md replace the
      // changelog generated from commit messages, when present.
      releaseNote: (ctx) => {
        const notes = `docs/releases/v${ctx.version}.md`;
        return existsSync(notes)
          ? readFileSync(notes, "utf8")
          : ctx.release.changelog;
      },
    },
  },

  test: {
    waitForPlugin: `() => Zotero.${pkg.config.addonInstance}.data.initialized`,
  },

  // If you need to see a more detailed log, uncomment the following line:
  // logLevel: "trace",
});
