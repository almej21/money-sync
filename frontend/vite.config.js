import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCommitDateIso() {
  try {
    return execSync("git log -1 --format=%cI", {
      encoding: "utf8",
    }).trim();
  } catch {
    return new Date().toISOString();
  }
}

function getIconVersion() {
  try {
    const commitEpochSeconds = execSync("git log -1 --format=%ct", {
      encoding: "utf8",
    }).trim();
    const commitShortSha = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
    }).trim();
    if (commitEpochSeconds && commitShortSha) {
      return `${commitEpochSeconds}-${commitShortSha}`;
    }
  } catch {
    // Fall through to timestamp fallback.
  }
  return String(Date.now());
}

const commitDateIso = getCommitDateIso();
const appIconVersion = getIconVersion();

function replaceIconVersion(content) {
  return String(content).replaceAll("__APP_ICON_VERSION__", appIconVersion);
}

function iconVersionPlugin() {
  return {
    name: "icon-version-cache-busting",
    transformIndexHtml(html) {
      return replaceIconVersion(html);
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = String(req.url || "");
        if (!requestUrl.startsWith("/manifest.webmanifest")) {
          next();
          return;
        }

        try {
          const manifestPath = path.resolve(
            __dirname,
            "public/manifest.webmanifest",
          );
          const rawManifest = await fs.readFile(manifestPath, "utf8");
          const transformedManifest = replaceIconVersion(rawManifest);
          res.setHeader("Content-Type", "application/manifest+json");
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
          res.end(transformedManifest);
        } catch {
          next();
        }
      });
    },
    async closeBundle() {
      const manifestOutputPath = path.resolve(
        __dirname,
        "dist/manifest.webmanifest",
      );
      try {
        const rawManifest = await fs.readFile(manifestOutputPath, "utf8");
        await fs.writeFile(
          manifestOutputPath,
          replaceIconVersion(rawManifest),
          "utf8",
        );
      } catch {
        // Ignore missing output in non-build commands.
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), iconVersionPlugin()],
  define: {
    __APP_COMMIT_DATE_ISO__: JSON.stringify(commitDateIso),
    __APP_ICON_VERSION__: JSON.stringify(appIconVersion),
  },
});
