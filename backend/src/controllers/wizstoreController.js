import localities from "../data/israel-localities.json" with { type: "json" };
import { searchWizProducts, getWizOffers } from "../services/wizstore.service.js";
const cityById = new Map(localities.filter((c) => c.english).map((c) => [c.id, c.name]));
export async function searchWiz(req, res, next) {
  const q = req.query.q;
  if (typeof q !== 'string' || [...q.trim()].length < 3 || [...q.trim()].length > 60) return res.status(400).json({ message: 'Enter 3–60 characters' });
  try { return res.json({ data: await searchWizProducts(q.trim()) }); } catch (e) { next(e); }
}
export async function wizOffers(req, res, next) {
  const { code, cities } = req.query;
  const ids = typeof cities === 'string' ? cities.split(',') : [];
  if (typeof code !== 'string' || !/^\d{6,14}$/.test(code) || !ids.length || ids.length > 10 || new Set(ids).size !== ids.length || ids.some((id) => !cityById.has(id))) return res.status(400).json({ message: 'Invalid product or cities' });
  const offers = [], failedCities = [];
  for (const id of ids) {
    try { const result = await getWizOffers(code, cityById.get(id)); offers.push(...result.offers.map((offer) => ({ ...offer, cityId: id }))); }
    catch (e) {
      console.error("[WIZSTORE] Offer lookup failed", { cityId: id, city: cityById.get(id), status: e.status, error: e.message, wizstore: e.wizstore });
      failedCities.push({ cityId: id, city: cityById.get(id), message: e.message });
    }
  }
  return res.json({ data: { offers, failedCities, perCityLimit: 5 } });
}
export const resolveCity = (id) => cityById.get(id);
