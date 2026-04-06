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
