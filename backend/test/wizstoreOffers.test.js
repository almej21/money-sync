import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ShoppingList from '../src/models/ShoppingList.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { searchWiz, wizOffers } from '../src/controllers/wizstoreController.js';
import { updateSelectedCities, addSelectedOffer, refreshSelectedOffer } from '../src/controllers/shoppingListController.js';
const res = () => ({ statusCode:200, status(n){this.statusCode=n;return this;}, json(x){this.body=x;return this;} });
const fixture = { as_of:'2026-11-10', data:{city:{city_name:'חולון',city_slug:'holon'},items:[{matched:{code:'7290002114109',name:'פילה סלמון טרי ארוז'}}],stores_in_city_with_items:1,cheapest_stores:[{full_basket:true,chain_key:'yohananof',chain_name:'יוחננוף',store_id:'073',store_name:'חולון המרכבה',effective_total:59.9,shelf_total:89.9,url:'https://wizbi.store/store/yohananof/073'}]} };
test('search and selected offer workflow validates ownership and retains snapshots on failed refresh', async t => {
  const oldKey=process.env.WIZSTORE_API_KEY;process.env.WIZSTORE_API_KEY='test';t.after(()=>{if(oldKey===undefined)delete process.env.WIZSTORE_API_KEY;else process.env.WIZSTORE_API_KEY=oldKey;});
  let available=true; let currentPrice=59.9;
  t.mock.method(globalThis,'fetch',async url=>({ok:true,json:async()=>url.includes('/search?')?{data:{results:[{code:'7290002114109',name:'פילה סלמון טרי ארוז',min_effective:59.9}]}}:available?{...fixture,data:{...fixture.data,cheapest_stores:fixture.data.cheapest_stores.map(s=>({...s,effective_total:currentPrice}))}}:{...fixture,data:{...fixture.data,cheapest_stores:[]}}}));
  let r=res();await searchWiz({query:{q:'סלמון'}},r,assert.fail);assert.equal(r.body.data[0].code,'7290002114109');
  r=res();await wizOffers({query:{code:'7290002114109',cities:'6600'}},r,assert.fail);assert.equal(r.body.data.offers[0].price,59.9);assert.equal(r.body.data.offers[0].cityId,'6600');
  const owner=new mongoose.Types.ObjectId(),id=new mongoose.Types.ObjectId();const list=new ShoppingList({_id:id,ownerId:owner,name:'test'});
  t.mock.method(ShoppingList,'findOne',async filter=>String(filter.ownerId)===String(owner)?list:null);
  t.mock.method(ShoppingList.prototype,'save',async function(){await this.validate();return this;});t.mock.method(ShoppingList.prototype,'populate',async function(){return this;});
  const req={user:{_id:owner},params:{id:String(id)},body:{cities:['6600']}};
  r=res();await updateSelectedCities(req,r);assert.deepEqual([...list.selectedCities],['6600']);
  req.body={code:'7290002114109',cityId:'6600',chainKey:'yohananof',storeId:'073'};r=res();await addSelectedOffer(req,r);assert.equal(r.statusCode,201);assert.equal(list.items[0].offer.price,59.9);assert.equal(list.items[0].offer.shelfPrice,89.9);
  r=res();await addSelectedOffer(req,r);assert.equal(r.statusCode,409);
  const denied=res();await addSelectedOffer({...req,user:{_id:new mongoose.Types.ObjectId()}},denied);assert.equal(denied.statusCode,404);
  currentPrice=64.5; r=res(); await refreshSelectedOffer({...req,params:{...req.params,itemId:String(list.items[0]._id)}},r); assert.equal(list.items[0].offer.price,64.5);
  available=false;await assert.rejects(refreshSelectedOffer({...req,params:{...req.params,itemId:String(list.items[0]._id)}},res()),{status:409});assert.equal(list.items[0].offer.price,64.5);
});


test('rate-limited city lookup logs the WizStore error and returns the failure', async t => {
  const oldKey = process.env.WIZSTORE_API_KEY;
  process.env.WIZSTORE_API_KEY = 'test';
  t.after(() => { if (oldKey === undefined) delete process.env.WIZSTORE_API_KEY; else process.env.WIZSTORE_API_KEY = oldKey; });
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 429, headers: new Headers({ 'retry-after': '45', 'x-ratelimit-remaining': '0', 'x-credits-used': '100' }), json: async () => ({ message: 'Hourly basket limit reached', code: 'basket_limit', secret: 'private', detail: 'key test' }) }));
  const logger = t.mock.method(console, 'error', () => {});
  const response = res();
  await wizOffers({ query: { code: '7290002114109', cities: '6600' } }, response, assert.fail);
  assert.equal(response.body.data.failedCities[0].message, 'WizStore rate limit reached; try again later');
  assert.equal(logger.mock.calls.length, 1);
  assert.equal(logger.mock.calls[0].arguments[1].status, 429);
  assert.equal(logger.mock.calls[0].arguments[1].wizstore.endpoint, '/basket');
  assert.deepEqual(logger.mock.calls[0].arguments[1].wizstore.body, { message: 'Hourly basket limit reached', code: 'basket_limit', detail: 'key [redacted]' });
  assert.equal(logger.mock.calls[0].arguments[1].wizstore.headers['retry-after'], '45');
  assert.equal(logger.mock.calls[0].arguments[1].wizstore.headers['x-ratelimit-remaining'], '0');
  assert.equal(logger.mock.calls[0].arguments[1].wizstore.headers['x-credits-used'], '100');
  assert.equal(logger.mock.calls[0].arguments[1].error, 'WizStore rate limit reached; try again later');
});


test('search rate-limit details reach the central error log', async t => {
  const oldKey = process.env.WIZSTORE_API_KEY;
  process.env.WIZSTORE_API_KEY = 'test';
  t.after(() => { if (oldKey === undefined) delete process.env.WIZSTORE_API_KEY; else process.env.WIZSTORE_API_KEY = oldKey; });
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 429, headers: new Headers({ 'retry-after': '60', 'x-ratelimit-remaining': '0' }) }));
  const logger = t.mock.method(console, 'error', () => {});
  const response = res();
  await searchWiz({ query: { q: 'milk' } }, response, error => errorHandler(error, { method: 'GET', originalUrl: '/search' }, response, () => {}));
  assert.equal(response.statusCode, 429);
  const details = logger.mock.calls.find(call => call.arguments[0] === '[WIZSTORE] Upstream response').arguments[1];
  assert.equal(details.endpoint, '/search');
  assert.equal(details.upstreamStatus, 429);
  assert.equal(details.headers['retry-after'], '60');
  assert.equal(details.headers['x-ratelimit-remaining'], '0');
});
