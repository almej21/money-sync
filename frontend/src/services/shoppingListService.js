import { api } from "../api";

export async function getShoppingLists() {
  return api("/shopping-lists");
}

export async function createShoppingList(payload) {
  return api("/shopping-lists", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function toggleShoppingListItem(listId, itemId) {
  return api(`/shopping-lists/${listId}/items/${itemId}/toggle`, {
    method: "PATCH",
  });
}

export async function deleteShoppingList(listId) {
  return api(`/shopping-lists/${listId}`, {
    method: "DELETE",
  });
}

export async function updateShoppingList(listId, payload) {
  return api(`/shopping-lists/${listId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export const searchCatalogProducts = (query, signal) =>
  api(`/catalog/search?q=${encodeURIComponent(query)}`, { signal });
export const renameComparisonList = (id, name) =>
  api(`/shopping-lists/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
export const addComparisonItem = (id, barcodes) =>
  api(`/shopping-lists/${id}/items`, { method: "POST", body: JSON.stringify({ selectionType: "same_name", barcodes, quantity: 1 }) });
export const addCanonicalComparisonItem = (id, canonicalId) =>
  api(`/shopping-lists/${id}/items`, { method: "POST", body: JSON.stringify({ selectionType: "canonical", canonicalId, quantity: 1 }) });
export const changeComparisonQuantity = (id, itemId, quantity) =>
  api(`/shopping-lists/${id}/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ quantity }) });
export const removeComparisonItem = (id, itemId) =>
  api(`/shopping-lists/${id}/items/${itemId}`, { method: "DELETE" });
export const compareShoppingList = (id, filters) =>
  api(`/shopping-lists/${id}/compare`, { method: "POST", body: JSON.stringify(filters) });

export const getLocalities = () => api("/catalog/localities");
export const searchWizProducts = (query, signal) => api(`/catalog/wizstore/search?q=${encodeURIComponent(query)}`, { signal });
export const getWizOffers = (code, cities, signal) => api(`/catalog/wizstore/offers?code=${encodeURIComponent(code)}&cities=${encodeURIComponent(cities.join(','))}`, { signal });
export const setListCities = (id, cities) => api(`/shopping-lists/${id}/cities`, { method: 'PUT', body: JSON.stringify({ cities }) });
export const saveSelectedOffer = (id, offer) => api(`/shopping-lists/${id}/offers`, { method: 'POST', body: JSON.stringify({ code: offer.code, cityId: offer.cityId, chainKey: offer.chainKey, storeId: offer.storeId }) });
export const refreshSelectedOffer = (id, itemId) => api(`/shopping-lists/${id}/offers/${itemId}/refresh`, { method: 'POST' });
