const base = 'https://data.openisraelisupermarkets.co.il';
const allowedChain = /חצי\s*חינם|אושר\s*עד|רמי\s*לוי|יוחננוף|סופר\s*ספיר|hazi\s*hinam|osher\s*ad|rami\s*levy|yoha?nanof|super\s*sapir/i;

async function request(path) {
  const token = process.env.OPEN_SUPERMARKETS_API_TOKEN;
  if (!token) { const e = new Error('Store lookup API token is not configured'); e.status = 503; throw e; }
  let response;
  try { response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }); }
  catch { const e = new Error('Store lookup service is unavailable'); e.status = 502; throw e; }
  if (!response.ok) { const e = new Error(response.status === 429 ? 'Store lookup rate limit reached' : response.status === 404 ? 'Product not found in store lookup service' : 'Store lookup request failed'); e.status = response.status === 404 ? 404 : response.status === 429 ? 429 : 502; throw e; }
  try { return await response.json(); } catch { const e = new Error('Invalid store lookup response'); e.status = 502; throw e; }
}

export async function findStores(code, cities) {
  const [productResult, chainResult] = await Promise.all([request(`/products/barcode/${code}`), request('/chains/')]);
  const product = productResult?.product;
  if (!product?.id || String(product.productBarcode) !== code || !Array.isArray(chainResult?.chains)) { const e = new Error('Invalid store lookup response'); e.status = 502; throw e; }
  const chainMap = new Map(chainResult.chains.map(entry => entry.chain || entry).filter(c => c?.id && allowedChain.test(c.chainName || '')).map(c => [String(c.id), c]));
  const response = await request(`/stores/?product_id=${encodeURIComponent(product.id)}`);
  if (!Array.isArray(response?.stores)) { const e = new Error('Invalid store lookup response'); e.status = 502; throw e; }
  return response.stores.flatMap(store => {
    const chain = chainMap.get(String(store.chainId));
    const city = typeof store.address?.city === 'string' ? store.address.city.trim() : '';
    const locality = cities.find(c => c.name.trim() === city);
    if (!chain || !locality || !store.id) return [];
    return [{ storeId: String(store.id), storeName: store.storeName || '', chainName: chain.chainName, city, cityId: locality.id, address: store.address?.storeAddress || '', lastObservedAt: store.lastObservedAt || null }];
  });
}
