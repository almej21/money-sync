import ShoppingList from "../models/ShoppingList.js";

const CHECKED_ITEM_RETENTION_MS = 120 * 60 * 1000;

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function removeExpiredCheckedItems(items = [], now = new Date()) {
  const cutoffMs = now.getTime() - CHECKED_ITEM_RETENTION_MS;
  return items.filter((item) => {
    if (!item?.completed) return true;
    const completedAt = parseDate(item.completedAt);
    if (!completedAt) return true;
    return completedAt.getTime() > cutoffMs;
  });
}

function normalizeItems(items = [], options = {}) {
  const source = Array.isArray(items) ? items : [];
  const existingItemsById = options.existingItemsById || new Map();
  return source.map((item) => {
    const description = String(
      item?.description ?? item?.text ?? "",
    ).trim();
    const existingItemKey = String(item?._id || "").trim();
    const existingItem = existingItemsById.get(existingItemKey) || null;
    const completed = Boolean(item?.completed);
    const completedAt = completed
      ? parseDate(item?.completedAt) ||
        parseDate(existingItem?.completedAt) ||
        new Date()
      : null;
    return {
      description,
      quantity: Number(item?.quantity || 1),
      note: String(item?.note || "").trim(),
      completed,
      completedAt,
      completedBy: completed
        ? item?.completedBy || existingItem?.completedBy || null
        : null,
    };
  });
}

export async function listShoppingLists(req, res) {
  const now = new Date();
  const lists = await ShoppingList.find({
    householdId: req.user.householdId,
  }).sort({ updatedAt: -1 });

  await Promise.all(
    lists.map(async (list) => {
      const nextItems = removeExpiredCheckedItems(list.items, now);
      let changed = nextItems.length !== list.items.length;

      if (!changed) {
        for (const item of list.items) {
          if (!item?.completed || item?.completedAt) continue;
          item.completedAt = now;
          changed = true;
        }
      }

      if (changed) {
        list.items = nextItems;
        await list.save();
      }
    }),
  );

  res.json(lists);
}

export async function createShoppingList(req, res) {
  const normalizedItems = removeExpiredCheckedItems(
    normalizeItems(req.body.items).filter((item) => item.description),
  );
  const list = await ShoppingList.create({
    householdId: req.user.householdId,
    title: req.body.title,
    createdBy: req.user._id,
    collaborators: req.body.collaborators || [
      { userId: req.user._id, canEdit: true },
    ],
    items: normalizedItems,
  });

  res.status(201).json(list);
}

export async function updateShoppingList(req, res) {
  const list = await ShoppingList.findOne({
    _id: req.params.id,
    householdId: req.user.householdId,
  });

  if (!list) {
    return res.status(404).json({ message: "Shopping list not found" });
  }

  const nextPayload = { ...req.body };
  if (Object.hasOwn(req.body || {}, "items")) {
    const existingItemsById = new Map(
      (Array.isArray(list.items) ? list.items : []).map((item) => [
        String(item?._id || "").trim(),
        item,
      ]),
    );

    nextPayload.items = removeExpiredCheckedItems(
      normalizeItems(req.body.items, { existingItemsById }).filter(
        (item) => item.description,
      ),
    );
  }

  list.set(nextPayload);
  await list.save();

  res.json(list);
}

export async function toggleShoppingItem(req, res) {
  const { listId, itemId } = req.params;

  const list = await ShoppingList.findOne({
    _id: listId,
    householdId: req.user.householdId,
  });

  if (!list) {
    return res.status(404).json({ message: "List not found" });
  }

  const item = list.items.id(itemId);
  if (!item) {
    return res.status(404).json({ message: "Item not found" });
  }

  item.completed = !item.completed;
  item.completedAt = item.completed ? new Date() : null;
  item.completedBy = item.completed ? req.user._id : null;

  const nextItems = removeExpiredCheckedItems(list.items);
  if (nextItems.length !== list.items.length) {
    list.items = nextItems;
  }

  await list.save();

  res.json(list);
}

export async function deleteShoppingList(req, res) {
  const deleted = await ShoppingList.findOneAndDelete({
    _id: req.params.id,
    householdId: req.user.householdId,
  });

  if (!deleted) {
    return res.status(404).json({ message: "Shopping list not found" });
  }

  res.json({ success: true });
}
