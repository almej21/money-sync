const DB_NAME = "money-sync-expenses";
const DB_VERSION = 1;
const EXPENSE_STORE = "expenses";
const META_STORE = "meta";
const META_LAST_SYNC_AT_KEY = "lastSyncAt";
const META_SYNC_CURSOR_KEY = "syncCursor";
const META_CACHE_USER_ID_KEY = "cacheUserId";
const META_CACHE_HOUSEHOLD_ID_KEY = "cacheHouseholdId";

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EXPENSE_STORE)) {
        db.createObjectStore(EXPENSE_STORE, { keyPath: "_id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, storeName, callback) {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = await callback(store, tx);
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function getCachedExpenses() {
  return withStore("readonly", EXPENSE_STORE, async (store) => {
    const items = await promisifyRequest(store.getAll());
    return Array.isArray(items) ? items : [];
  });
}

export async function replaceCachedExpenses(expenses) {
  const items = Array.isArray(expenses) ? expenses : [];
  await withStore("readwrite", EXPENSE_STORE, async (store) => {
    await promisifyRequest(store.clear());
    for (const item of items) {
      if (!item?._id) continue;
      store.put(item);
    }
  });
}

export async function upsertCachedExpenses(expenses) {
  const items = Array.isArray(expenses) ? expenses : [];
  if (!items.length) return;

  await withStore("readwrite", EXPENSE_STORE, async (store) => {
    for (const item of items) {
      if (!item?._id) continue;
      store.put(item);
    }
  });
}

export async function getExpenseCacheMeta() {
  return withStore("readonly", META_STORE, async (store) => {
    const [
      lastSyncAtEntry,
      syncCursorEntry,
      cacheUserIdEntry,
      cacheHouseholdIdEntry,
    ] = await Promise.all([
      promisifyRequest(store.get(META_LAST_SYNC_AT_KEY)),
      promisifyRequest(store.get(META_SYNC_CURSOR_KEY)),
      promisifyRequest(store.get(META_CACHE_USER_ID_KEY)),
      promisifyRequest(store.get(META_CACHE_HOUSEHOLD_ID_KEY)),
    ]);

    return {
      lastSyncAt: toIso(lastSyncAtEntry?.value),
      syncCursor: toIso(syncCursorEntry?.value),
      cacheUserId: String(cacheUserIdEntry?.value || "").trim(),
      cacheHouseholdId: String(cacheHouseholdIdEntry?.value || "").trim(),
    };
  });
}

export async function setExpenseCacheMeta(meta = {}) {
  const { lastSyncAt, syncCursor } = meta;
  await withStore("readwrite", META_STORE, async (store) => {
    if (Object.hasOwn(meta, "lastSyncAt")) {
      store.put({
        key: META_LAST_SYNC_AT_KEY,
        value: toIso(lastSyncAt),
      });
    }
    if (Object.hasOwn(meta, "syncCursor")) {
      store.put({
        key: META_SYNC_CURSOR_KEY,
        value: toIso(syncCursor),
      });
    }
    if (Object.hasOwn(meta, "cacheUserId")) {
      store.put({
        key: META_CACHE_USER_ID_KEY,
        value: String(meta.cacheUserId || "").trim(),
      });
    }
    if (Object.hasOwn(meta, "cacheHouseholdId")) {
      store.put({
        key: META_CACHE_HOUSEHOLD_ID_KEY,
        value: String(meta.cacheHouseholdId || "").trim(),
      });
    }
  });
}

export async function clearExpenseCache() {
  await withStore("readwrite", EXPENSE_STORE, async (store) => {
    await promisifyRequest(store.clear());
  });
  await withStore("readwrite", META_STORE, async (store) => {
    await promisifyRequest(store.clear());
  });
}
