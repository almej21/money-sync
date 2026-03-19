import { Router } from "express";
import {
  createShoppingList,
  deleteShoppingList,
  listShoppingLists,
  toggleShoppingItem,
  updateShoppingList,
} from "../controllers/shoppingListController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", listShoppingLists);
router.post("/", createShoppingList);
router.put("/:id", updateShoppingList);
router.patch("/:listId/items/:itemId/toggle", toggleShoppingItem);
router.delete("/:id", deleteShoppingList);

export default router;
