import test from 'node:test';
import assert from 'node:assert/strict';
import { findStores } from '../src/services/openSupermarkets.service.js';

test('matches the requested barcode, chains, and selected cities without inventing store prices', async t => {
  const previousFetch = globalThis.fetch, previousToken = process.env.OPEN_SUPERMARKETS_API_TOKEN;
  process.env.OPEN_SUPERMARKETS_API_TOKEN = 'test-token';
  t.after(() => { globalThis.fetch = previousFetch; if (previousToken === undefined) delete process.env.OPEN_SUPERMARKETS_API_TOKEN; else process.env.OPEN_SUPERMARKETS_API_TOKEN = previousToken; });
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    let data;
    if (url.endsWith('/products/barcode/7290002114109')) data = { product: { id: 'p1', productBarcode: 7290002114109 } };
    else if (url.endsWith('/chains/')) data = { chains: [{ chain: { id: 'a', chainName: 'מ. יוחננוף ובניו' } }, { chain: { id: 'b', chainName: 'Other' } }] };
    else data = { stores: [
      { id: '1', chainId: 'a', storeName: 'חולון', address: { city: 'חולון', storeAddress: 'כתובת' } },
      { id: '2', chainId: 'a', address: { city: 'חיפה' } },
      { id: '3', chainId: 'b', address: { city: 'חולון' } },
    ] };
    return { ok: true, json: async () => data };
  };
  const result = await findStores('7290002114109', [{ id: '6600', name: 'חולון' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].storeId, '1');
  assert.equal(result[0].cityId, '6600');
  assert.equal(Object.hasOwn(result[0], 'price'), false);
});
