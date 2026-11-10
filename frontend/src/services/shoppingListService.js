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
export const changeComparisonQuantity = (id, itemId, quantity) =>
  api(`/shopping-lists/${id}/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ quantity }) });
export const removeComparisonItem = (id, itemId) =>
  api(`/shopping-lists/${id}/items/${itemId}`, { method: "DELETE" });
export const compareShoppingList = (id, filters) =>
  api(`/shopping-lists/${id}/compare`, { method: "POST", body: JSON.stringify(filters) });

export const getLocalities = () => api("/catalog/localities");
