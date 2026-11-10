import { Router } from "express";
import { searchCatalog, getCatalogGroup, getCatalogPrices, getLocalities } from "../controllers/catalogController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);
router.get("/search", searchCatalog);
router.get("/localities", getLocalities);
router.get("/groups/:id", getCatalogGroup);
router.get("/products/:barcode/prices", getCatalogPrices);

export default router;
