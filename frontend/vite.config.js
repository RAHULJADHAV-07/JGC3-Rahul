import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Stamps each build, so a tab left open can tell a newer one has gone up
// (src/lib/appUpdate.js): the stamp goes into the page it serves and into
// /version.json beside it. It is worked out from what was built — building the
// same code twice gives the same stamp, and nobody is asked to reload for
// nothing.
export function buildStamp() {
  return {
    name: "jg-build-stamp",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
      const page = bundle["index.html"];
      const html = String(page?.source || "");
      if (!html.includes("</head>")) throw new Error("build stamp: index.html was not built before it");
      const files = Object.keys(bundle).filter((f) => /\.(js|css)$/.test(f)).sort();
      const build = createHash("sha256").update([version, html, ...files].join("\n")).digest("hex").slice(0, 16);
      page.source = html.replace("</head>", `  <meta name="app-build" content="${build}" />\n  </head>`);
      this.emitFile({ type: "asset", fileName: "version.json", source: `${JSON.stringify({ version, build })}\n` });
    },
  };
}

// The dev server proxies /api to the backend so the browser makes same-origin
// calls in development. In production the built assets are served by nginx,
// which proxies /api to the backend container (see nginx.conf).
//
// loadEnv() reads the .env file (process.env alone does NOT include .env
// values), so VITE_PORT and VITE_API_PROXY in .env take effect here.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), buildStamp()],
    server: {
      port: Number(env.VITE_PORT) || 5173,
      strictPort: false, // if the port is taken, Vite picks the next free one
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY || "http://localhost:8000",
          changeOrigin: true,
        },
      },
    },
  };
});
