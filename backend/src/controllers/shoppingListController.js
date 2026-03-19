import ShoppingList from "../models/ShoppingList.js";

export async function listShoppingLists(req, res) {
  const lists = await ShoppingList.find({
    householdId: req.user.householdId,
  }).sort({ updatedAt: -1 });

  res.json(lists);
}

export async function createShoppingList(req, res) {
  const list = await ShoppingList.create({
    householdId: req.user.householdId,
    title: req.body.title,
    createdBy: req.user._id,
    collaborators: req.body.collaborators || [
      { userId: req.user._id, canEdit: true },
    ],
    items: req.body.items || [],
  });

  res.status(201).json(list);
}

export async function updateShoppingList(req, res) {
  const list = await ShoppingList.findOneAndUpdate(
    { _id: req.params.id, householdId: req.user.householdId },
    req.body,
    { new: true },
  );

  if (!list) {
    return res.status(404).json({ message: "Shopping list not found" });
  }

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
  item.completedBy = item.completed ? req.user._id : null;
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
