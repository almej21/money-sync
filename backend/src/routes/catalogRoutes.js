import { searchWiz, wizOffers } from "../controllers/wizstoreController.js";
import { Router } from "express";
import { searchCatalog, getCatalogGroup, getCatalogPrices, getLocalities } from "../controllers/catalogController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);
router.get("/wizstore/search", searchWiz);
router.get("/wizstore/offers", wizOffers);
router.get("/search", searchCatalog);
router.get("/localities", getLocalities);
router.get("/groups/:id", getCatalogGroup);
router.get("/products/:barcode/prices", getCatalogPrices);

export default router;
