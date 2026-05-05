const MIN_NODE_VERSION = "22.12.0";

function parseSemver(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function isNodeVersionSupported(
  currentVersion = process.versions?.node,
  minVersion = MIN_NODE_VERSION,
) {
  const current = parseSemver(currentVersion);
  const minimum = parseSemver(minVersion);
  if (!current || !minimum) return false;
  return compareSemver(current, minimum) >= 0;
}

export function assertSupportedNodeVersion({
  currentVersion = process.versions?.node,
  minVersion = MIN_NODE_VERSION,
  dependencyName = "israeli-bank-scrapers",
} = {}) {
  if (isNodeVersionSupported(currentVersion, minVersion)) return;
  throw new Error(
    `Node ${currentVersion} is not supported by ${dependencyName}. Use Node >= ${minVersion}`,
  );
}

export { MIN_NODE_VERSION };
