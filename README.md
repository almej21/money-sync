# Home Sync

Shared household finance + shopping list app.

## Stack

- Frontend: React + Vite
- Backend: Express + serverless-http + AWS Lambda
- DB: MongoDB Atlas
- Auth: JWT email/password
- Deploy:
  - Frontend -> Vercel
  - Backend -> AWS Lambda (Serverless Framework)
  - DB -> MongoDB Atlas

## Setup

Node.js `22.12.0+` is required (`.nvmrc` is set to `22.17.1`).

```bash
nvm use
npm install
npm install --workspaces
```

## Catalog API

The authenticated catalog endpoints use PriceIL's public API. Set the optional
`PRICEIL_API_KEY` in `backend/.env` for a keyed plan; the free API also works
without a key. Configure `MONGODB_URI` and the existing JWT settings as usual.
Serverless deployments pass `PRICEIL_API_KEY` through to Lambda. Search and price
responses are cached in memory for one minute per process; the cache is not shared
between Lambda instances. Search reads PriceIL directly. A selected exact product
is saved to MongoDB automatically when added to a list by barcode.

With the backend running on port 4000, replace `<token>` with an existing user's
JWT and try:

```bash
curl -G 'http://localhost:4000/api/catalog/search' --data-urlencode 'q=milk' -H 'Authorization: Bearer <token>'
curl 'http://localhost:4000/api/catalog/groups/24898522' -H 'Authorization: Bearer <token>'
curl 'http://localhost:4000/api/catalog/products/5000159028158/prices' -H 'Authorization: Bearer <token>'
curl -G 'http://localhost:4000/api/catalog/products/7290000051352/prices' --data-urlencode 'city=ירושלים' -H 'Authorization: Bearer <token>'
```

Search returns `data.products` containing exact names and arrays of barcodes for
matching PriceIL products. It requires 3–100 characters and groups results from
the first provider page only; `coverage` is `first_page_only` and other barcodes
may exist. Comparing a selection covers only its submitted barcodes.
Optionally pass `cities=חולון,חיפה` (or repeat `cities`) to return only
barcodes with a store in at least one target city, and only those matching stores.
City names and locality codes are accepted. `lookupFailures` lists barcodes
whose store lookup failed, so filtered results may be incomplete.
Each product also includes `barcodeDetails`, with a `barcode`, its `stores`
(`storeName`, `city`, and provider `price`), and a lookup `status`. A missing
price is `null`. Known numeric city codes are
displayed as Hebrew locality names; unknown codes are preserved as returned by
the provider. An empty stores array with `lookup_failed` means branch information
could not be retrieved; an empty array
with `ok` means the provider returned no prices. Each barcode requires a separate
provider request, so rate limits can cause partial results.
To select a merged result, send `{ "selectionType": "same_name", "barcodes":
["...", "..."], "quantity": 1 }` to the list items endpoint. The server verifies
each barcode and exact name. Comparisons of multiple barcodes require matching,
known unit, quantity and package count; unknown or incompatible units suppress
rankings. Weighted products remain unsupported.
Send a selected barcode when adding an exact list item; no manual product import
is needed. `/catalog/groups/:id` takes a numeric PriceIL group ID. PriceIL group
details include the provider's member products, and prices include the product
and its current store prices. Successful
responses use `{ "data": ... }`; errors use `{ "message": ... }`.
The prices endpoint accepts an optional city filter; city names and locality codes
are matched using a bundled snapshot of the Israeli CBS locality dictionary (2024).
The basket comparison uses the same matching. The snapshot may require updating
when localities change. City filtering is not a distance or radius calculation;
stores without a matching city are omitted.
The client should issue a request when input reaches five characters, or after
three seconds of inactivity with at least three characters; this timing must be
implemented by the client, which observes keystrokes.
Run the focused checks with `node --test backend/test/catalog.test.js`.

## Owner shopping-list API

New product-selection lists are private to their creator. The earlier household
free-text list API remains available for the existing frontend.

Exact items can be added using a barcode from search. The backend retrieves the
product from PriceIL and stores it locally if needed. The existing generic-group
API still accepts IDs of locally populated groups.

All requests require `Authorization: Bearer <token>`. The following examples use
`$TOKEN`, `$LIST_ID`, `$ITEM_ID`, `$PRODUCT_ID`, and `$GROUP_ID` as placeholders.
Use the IDs returned by earlier requests. Set `Content-Type: application/json`
for requests with a body.

```bash
curl -X POST localhost:4000/api/shopping-lists -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Weekly"}'
curl localhost:4000/api/shopping-lists -H "Authorization: Bearer $TOKEN"
curl localhost:4000/api/shopping-lists/$LIST_ID -H "Authorization: Bearer $TOKEN"
curl -X PATCH localhost:4000/api/shopping-lists/$LIST_ID -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Groceries"}'
curl -X POST localhost:4000/api/shopping-lists/$LIST_ID/items -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"selectionType":"exact","barcode":"7290000051352","quantity":2}'
curl -X POST localhost:4000/api/shopping-lists/$LIST_ID/items -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"selectionType\":\"exact\",\"productId\":\"$PRODUCT_ID\",\"quantity\":2}"
curl -X POST localhost:4000/api/shopping-lists/$LIST_ID/items -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"selectionType\":\"generic\",\"groupId\":\"$GROUP_ID\"}"
curl -X PATCH localhost:4000/api/shopping-lists/$LIST_ID/items/$ITEM_ID -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"quantity":3}'
curl -X DELETE localhost:4000/api/shopping-lists/$LIST_ID/items/$ITEM_ID -H "Authorization: Bearer $TOKEN"
curl -X DELETE localhost:4000/api/shopping-lists/$LIST_ID -H "Authorization: Bearer $TOKEN"
```

Create and item-add return 201; reads and updates return the list document (list
GET returns an array), with product or group details populated. List deletion
returns `{ "success": true }`. An item update can change selection by providing
both `selectionType` and the corresponding `productId` or `groupId`. Invalid
input returns 400, missing or inaccessible records 404, and duplicates or
concurrent modification conflicts 409, each with `{ "message": "..." }`.
Run tests with `node --test backend/test/*.test.js`.

## Basket comparison

`POST /api/shopping-lists/:id/compare` compares an owned, nonempty list. The
optional JSON body accepts exact, case-insensitive `city` and `chain` strings,
and `storeIds`, an array of positive PriceIL branch IDs. For example:

```bash
curl -X POST "localhost:4000/api/shopping-lists/$LIST_ID/compare" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"city":"Haifa","storeIds":[1,2]}'
```

Amounts are decimal ILS strings, calculated in integer agorot. Generic items
select the cheapest listed alternative independently in each branch. Results
include a `knownSubtotal`, but `totalPrice` and `rank` are null for incomplete
baskets. If any lookup fails or a catalog reference is invalid, `comparisonIncomplete`
is true and all ranks are null: an unknown alternative could alter the ordering.
`lookupFailures` and `invalidItems` explain such gaps. A missing price is not
proof that an item is out of stock; `stockStatus` is always `unknown`. Price
freshness is shown as the provider's `priceUpdateDate` when available. Weighted
products cannot be compared and are reported as `weighted_product` failures.
Branches are discovered from returned prices, so branches with no returned prices
for any basket product are not included, even if listed in `storeIds`.

The PriceIL client caches results for one minute per process, limits concurrent
requests, and enforces a conservative 20-request rolling-minute budget per process.
When the budget is exhausted it fails lookups promptly; retry after the window
expires. Separate Lambda instances do not share this budget: production
deployments need a shared rate limiter to enforce the upstream quota globally.
The native PriceIL basket API is barcode-based and does not document the local
generic-alternative selection required here, so comparisons use product prices.

## Keep Frontend Prod API URL In Sync

After backend deploys, run:

```bash
npm run sync:frontend:api-url
```

This command:

- Runs `npx serverless info --stage prod` in `backend/`
- Extracts the current API Gateway invoke URL
- Writes `VITE_API_URL=<invoke-url>/api` into `frontend/.env.production`

### Optional profile / extra Serverless args

You can pass extra args directly to the script:

```bash
node scripts/sync-frontend-api-url.mjs prod --aws-profile your-profile
```
