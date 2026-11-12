const base = "https://wizbi.store/api/v1";
async function request(path, options = {}) {
  const key = process.env.WIZSTORE_API_KEY;
  if (!key) { const e = new Error("WizStore API key is not configured"); e.status = 503; throw e; }
  let response;
  try {
    response = await fetch(base + path, { ...options, headers: { "x-api-key": key, ...(options.headers || {}) }, signal: AbortSignal.timeout(12000) });
  } catch { const e = new Error("WizStore is unavailable"); e.status = 502; throw e; }
  if (!response.ok) {
    const e = new Error(response.status === 401 ? "WizStore API key is invalid or revoked" : response.status === 429 ? "WizStore rate limit reached; try again later" : "WizStore request failed");
    e.status = response.status === 429 ? 429 : 502;
    const headers = ["retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "x-credits-cost", "x-credits-used", "x-credits-remaining"];
    let errorBody;
    try {
      const body = await response.json();
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const fields = ["error", "message", "detail", "code", "retry_after", "retryAfter"];
        errorBody = Object.fromEntries(fields.flatMap((field) => {
          const value = body[field];
          if (!["string", "number", "boolean"].includes(typeof value)) return [];
          const safe = typeof value === "string"
            ? value.split(key).join("[redacted]").replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 500)
            : value;
          return [[field, safe]];
        }));
        if (!Object.keys(errorBody).length) errorBody = undefined;
      }
    } catch {
      // Error bodies may be empty or non-JSON; preserve the original error.
    }
    e.wizstore = {
      endpoint: path.split("?")[0],
      upstreamStatus: response.status,
      ...(errorBody && { body: errorBody }),
      headers: Object.fromEntries(headers.map((name) => [name, response.headers?.get(name)]).filter(([, value]) => value != null)),
    };
    throw e;
  }
  const body = await response.json();
  if (!body || !body.data) { const e = new Error("Invalid WizStore response"); e.status = 502; throw e; }
  return body;
}
export async function searchWizProducts(query) {
  const body = await request(`/search?q=${encodeURIComponent(query)}&limit=20`);
  if (!Array.isArray(body.data.results)) { const e = new Error("Invalid WizStore search response"); e.status = 502; throw e; }
  return body.data.results.filter((p) => /^\d{6,14}$/.test(String(p.code)) && typeof p.name === "string").map((p) => ({ code: String(p.code), name: p.name, manufacturer: p.manufacturer || null, minEffective: p.min_effective ?? null }));
}
export async function getWizOffers(code, city) {
  const body = await request('/basket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [code], city }) });
  const data = body.data, matched = data.items?.[0]?.matched;
  if (String(matched?.code) !== code || !Array.isArray(data.cheapest_stores)) { const e = new Error("WizStore could not price this product in the selected city"); e.status = 502; throw e; }
  const offers = data.cheapest_stores.filter((s) => s.full_basket === true && typeof s.effective_total === 'number' && Number.isFinite(s.effective_total) && s.effective_total >= 0 && s.store_id != null && typeof s.chain_key === 'string').map((s) => ({
    code, name: matched.name, city: data.city?.city_name || city, citySlug: data.city?.city_slug || '', chainKey: s.chain_key, chainName: s.chain_name || '', storeId: String(s.store_id), storeName: s.store_name || '', address: s.address || '', price: s.effective_total, shelfPrice: s.shelf_total ?? null, asOf: body.as_of || null, page: s.url || body.page || 'https://wizbi.store', quantity: 1,
  }));
  return { offers, count: data.stores_in_city_with_items ?? null, limit: 5 };
}
