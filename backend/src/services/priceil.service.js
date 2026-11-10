const BASE_URL = "https://api.priceil.dev";
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 200;
const cache = new Map();
const pending = new Map();
// A conservative per-process budget also covers anonymous access. Distributed
// deployments need a shared limiter to enforce a quota across instances.
const requestTimes = [];
let activeRequests = 0;

class PriceilError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, params = {}) {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const cacheKey = url.toString();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (cached) cache.delete(cacheKey);
  if (pending.has(cacheKey)) return pending.get(cacheKey);

  const now = Date.now();
  while (requestTimes.length && requestTimes[0] <= now - 60_000) requestTimes.shift();
  if (requestTimes.length >= 20 || activeRequests >= 3) {
    console.warn("[PRICEIL] request capacity exceeded", { path, requestsLastMinute: requestTimes.length, activeRequests });
    throw new PriceilError("PriceIL request capacity exceeded; retry later", 503);
  }
  requestTimes.push(now);
  activeRequests++;

  const operation = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const headers = { accept: "application/json" };
      if (process.env.PRICEIL_API_KEY) headers["x-api-key"] = process.env.PRICEIL_API_KEY;
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok) {
        console.warn("[PRICEIL] upstream HTTP error", { path, status: response.status });
        if (response.status === 404) throw new PriceilError("Catalog item not found", 404);
        if (response.status === 429) throw new PriceilError("PriceIL rate limit exceeded", 503);
        throw new PriceilError("PriceIL request failed", 502);
      }
      let body;
      try { body = await response.json(); } catch { throw new PriceilError("Invalid response from PriceIL", 502); }
      if (!body || body.success !== true || !Object.hasOwn(body, "data") || body.data == null) {
        throw new PriceilError("Invalid response from PriceIL", 502);
      }
      if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, { data: body.data, expiresAt: Date.now() + CACHE_TTL_MS });
      return body.data;
    } catch (err) {
      if (err instanceof PriceilError) throw err;
      if (controller.signal.aborted) { console.warn("[PRICEIL] request timed out", { path, timeoutMs: TIMEOUT_MS }); throw new PriceilError("PriceIL request timed out", 504); }
      console.warn("[PRICEIL] request unavailable", { path, error: err?.message || String(err) });
      throw new PriceilError("PriceIL is unavailable", 502);
    } finally {
      clearTimeout(timer);
      activeRequests--;
    }
  })();
  pending.set(cacheKey, operation);
  try { return await operation; } finally { pending.delete(cacheKey); }
}

export const searchProducts = (q) => request("/products", { q, page: "1", limit: "20" });
export const getProduct = (barcode) => request(`/products/${encodeURIComponent(barcode)}`);
export const searchGroups = (q) => request("/products/groups", { q, page: "1", limit: "20" });
export const getGroup = (id) => request(`/products/groups/${encodeURIComponent(id)}`);
export const getProductPrices = (barcode) => request(`/products/${encodeURIComponent(barcode)}/prices`);
