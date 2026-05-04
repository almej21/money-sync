import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const backendDir = path.join(repoRoot, "backend");
const frontendProdEnvPath = path.join(repoRoot, "frontend", ".env.production");

const stage = process.argv[2] || "prod";
const extraServerlessArgs = process.argv.slice(3);

function runServerlessInfo() {
  const commandArgs = ["serverless", "info", "--stage", stage, ...extraServerlessArgs];
  const result = spawnSync("npx", commandArgs, {
    cwd: backendDir,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error) {
    throw new Error(`Failed to run npx ${commandArgs.join(" ")}: ${result.error.message}`);
  }

  const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  if (result.status !== 0) {
    throw new Error(
      [
        `serverless info failed (exit code ${result.status}).`,
        "Tip: ensure AWS credentials/profile are configured.",
        "",
        combinedOutput,
      ].join("\n"),
    );
  }

  return combinedOutput;
}

function extractInvokeBaseUrl(serverlessOutput) {
  const urlMatches = serverlessOutput.match(
    /https:\/\/[a-z0-9-]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com(?:\/[^\s]*)?/gi,
  );

  if (!urlMatches || !urlMatches.length) {
    throw new Error("Could not find an API Gateway URL in `serverless info` output.");
  }

  const firstUrl = urlMatches[0];
  return firstUrl
    .replace(/\/\{proxy\+\}\/?$/i, "")
    .replace(/\/\$default\/?$/i, "")
    .replace(/\/+$/, "");
}

function toFrontendApiUrl(invokeBaseUrl) {
  return invokeBaseUrl.endsWith("/api") ? invokeBaseUrl : `${invokeBaseUrl}/api`;
}

function writeFrontendProdEnv(viteApiUrl) {
  const nextLine = `VITE_API_URL=${viteApiUrl}`;
  let content = "";

  if (fs.existsSync(frontendProdEnvPath)) {
    content = fs.readFileSync(frontendProdEnvPath, "utf8");
  }

  if (/^VITE_API_URL=.*$/m.test(content)) {
    const updated = content.replace(/^VITE_API_URL=.*$/m, nextLine);
    fs.writeFileSync(frontendProdEnvPath, updated, "utf8");
    return;
  }

  const separator = content.length && !content.endsWith("\n") ? "\n" : "";
  const updated = `${content}${separator}${nextLine}\n`;
  fs.writeFileSync(frontendProdEnvPath, updated, "utf8");
}

function main() {
  const output = runServerlessInfo();
  const invokeBaseUrl = extractInvokeBaseUrl(output);
  const viteApiUrl = toFrontendApiUrl(invokeBaseUrl);
  writeFrontendProdEnv(viteApiUrl);

  console.log(`[sync-frontend-api-url] stage=${stage}`);
  console.log(`[sync-frontend-api-url] invoke=${invokeBaseUrl}`);
  console.log(`[sync-frontend-api-url] wrote ${frontendProdEnvPath}`);
  console.log(`[sync-frontend-api-url] VITE_API_URL=${viteApiUrl}`);
}

main();
