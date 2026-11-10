import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useLanguage } from "../context/LanguageContext";
import { addComparisonItem, changeComparisonQuantity, compareShoppingList, createShoppingList, deleteShoppingList, getShoppingLists, getLocalities, removeComparisonItem, renameComparisonList, searchCatalogProducts } from "../services/shoppingListService";
import { itemName, searchDelay, selectionExists, validRank } from "./comparisonUtils.mjs";

const translations = {
  en: { title: "Compare supermarket prices", subtitle: "Build a private product list and compare prices by branch.", newList: "New comparison list", name: "List name", create: "Create list", list: "Comparison list", noLists: "Create a comparison list to get started.", rename: "Rename", save: "Save", cancel: "Cancel", delete: "Delete list", confirmDelete: "Delete this comparison list?", search: "Search for a product", hint: "Enter at least 3 characters to search.", searching: "Searching…", noResults: "No matching products found.", partial: "Search covers only the first page of results; other products or barcodes may exist.", add: "Add", added: "Already added", codes: "barcodes", empty: "Your list is empty. Search for a product above.", qty: "Quantity", remove: "Remove", inferredWeight: "Weight basis inferred from products with the same name", perKg: "per kg", kilogram: "kg", unknownPackage: "Package size unknown", repairSelection: "Remove this item and add it again using the separate product choices.", cities: "Cities", searchCities: "Search cities", citiesHint: "Select one or more cities.", citiesError: "Could not load cities.", city: "City", chain: "Chain", branches: "Branch IDs, separated by commas", invalidBranches: "Enter positive branch IDs separated by commas.", filterHint: "City matches a city name or locality code; it does not measure distance. GPS filtering is not available.", compare: "Find the Cheapest Supermarket", comparing: "Comparing…", retry: "Retry", loading: "Loading…", retrySearch: "Retry search", unknown: "Unknown", compareAgain: "Results may change as prices are updated.", stock: "Stock availability is unknown.", incomplete: "Incomplete basket", complete: "Complete basket", cheapest: "Cheapest complete basket", partialResult: "Some lookups or catalog references failed. Rankings are unavailable.", notAll: "Comparison covers only the barcodes saved in this list.", missing: "Missing items", total: "Total", subtotal: "Known subtotal", unitPrice: "Unit price", updated: "Price updated", compared: "Compared", noStores: "No branches found for these filters and products.", failed: "Something went wrong. Please try again.", invalidName: "Enter a list name (up to 100 characters).", invalidQuantity: "Quantity must be a positive whole number.", duplicate: "This selection is already on the list.", unavailable: "Price unavailable", lookup_failed: "Price lookup failed", weighted_product: "Sold by weight; comparison is not supported", incompatible_or_unknown_units: "Package sizes or units cannot be compared", invalid_catalog_reference: "Product information is missing", sourceFailure: "Some product prices could not be retrieved.", reason: "Reason", freshnessUnknown: "Price update date unavailable", selectList: "Select a list", legacy: "Existing household lists appear below.", product: "Product", emptySearch: "Enter at least 3 characters.", invalidNameData: "Product details unavailable" },
  he: { title: "השוואת מחירי סופרמרקטים", subtitle: "צרו רשימת מוצרים אישית והשוו מחירים לפי סניף.", newList: "רשימת השוואה חדשה", name: "שם הרשימה", create: "יצירת רשימה", list: "רשימת השוואה", noLists: "צרו רשימת השוואה כדי להתחיל.", rename: "שינוי שם", save: "שמירה", cancel: "ביטול", delete: "מחיקת רשימה", confirmDelete: "למחוק את רשימת ההשוואה?", search: "חיפוש מוצר", hint: "יש להזין לפחות 3 תווים לחיפוש.", searching: "מחפש…", noResults: "לא נמצאו מוצרים מתאימים.", partial: "החיפוש כולל רק את עמוד התוצאות הראשון; ייתכן שקיימים מוצרים או ברקודים נוספים.", add: "הוספה", added: "כבר ברשימה", codes: "ברקודים", empty: "הרשימה ריקה. חפשו מוצר למעלה.", qty: "כמות", remove: "הסרה", inferredWeight: "בסיס המשקל הוסק ממוצרים בעלי שם זהה", perKg: "לק״ג", kilogram: "ק״ג", unknownPackage: "גודל האריזה אינו ידוע", repairSelection: "יש להסיר את הפריט ולהוסיף אותו מחדש באמצעות אפשרויות המוצר הנפרדות.", cities: "ערים", searchCities: "חיפוש עיר", citiesHint: "בחרו עיר אחת או יותר.", citiesError: "לא ניתן לטעון את רשימת הערים.", city: "עיר", chain: "רשת", branches: "מזהי סניפים, מופרדים בפסיקים", invalidBranches: "יש להזין מזהי סניפים חיוביים מופרדים בפסיקים.", filterHint: "עיר תואמת לשם או לסמל יישוב ואינה מודדת מרחק. סינון לפי GPS אינו זמין.", compare: "מציאת הסופרמרקט הזול ביותר", comparing: "משווה…", retry: "ניסיון חוזר", loading: "טוען…", retrySearch: "חיפוש חוזר", unknown: "לא ידוע", compareAgain: "המחירים עשויים להשתנות.", stock: "זמינות המלאי אינה ידועה.", incomplete: "סל חלקי", complete: "סל מלא", cheapest: "הסל המלא הזול ביותר", partialResult: "חלק מהמחירים או נתוני המוצרים חסרים. לא ניתן להציג דירוג.", notAll: "ההשוואה כוללת רק את הברקודים שנשמרו ברשימה.", missing: "מוצרים חסרים", total: "סה״כ", subtotal: "סכום ידוע", unitPrice: "מחיר ליחידה", updated: "המחיר עודכן", compared: "מועד ההשוואה", noStores: "לא נמצאו סניפים למוצרים ולסינון שנבחרו.", failed: "אירעה שגיאה. נסו שוב.", invalidName: "יש להזין שם רשימה (עד 100 תווים).", invalidQuantity: "הכמות חייבת להיות מספר שלם וחיובי.", duplicate: "הבחירה כבר נמצאת ברשימה.", unavailable: "מחיר לא זמין", lookup_failed: "לא ניתן לקבל מחיר", weighted_product: "מוצר לפי משקל; ההשוואה אינה נתמכת", incompatible_or_unknown_units: "לא ניתן להשוות מידות או יחידות אריזה", invalid_catalog_reference: "פרטי המוצר חסרים", sourceFailure: "לא ניתן היה לקבל חלק ממחירי המוצרים.", reason: "סיבה", freshnessUnknown: "תאריך עדכון המחיר אינו זמין", selectList: "בחירת רשימה", legacy: "הרשימות המשפחתיות מופיעות בהמשך.", product: "מוצר", emptySearch: "יש להזין לפחות 3 תווים.", invalidNameData: "פרטי המוצר אינם זמינים" },
};

function QuantityInput({ item, label, fallback, disabled, onSave, onInvalid }) {
  const [draft, setDraft] = useState(String(item.quantity));
  useEffect(() => { setDraft(String(item.quantity)); }, [item.quantity]);
  function commit() {
    const value = Number(draft);
    if (!draft.trim() || !Number.isSafeInteger(value) || value < 1) { setDraft(String(item.quantity)); onInvalid(); return; }
    if (value !== item.quantity) onSave(value);
  }
  return <TextField size="small" type="number" label={label} value={draft} disabled={disabled} inputProps={{ min: 1, step: 1, "aria-label": `${label} ${itemName(item, fallback)}` }} sx={{ width: 90 }} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

export default function PriceComparison() {
  const { locale, direction } = useLanguage();
  const text = String(locale || "").startsWith("he") ? translations.he : translations.en;
  const [lists, setLists] = useState([]), [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState(""), [renaming, setRenaming] = useState(false);
  const [query, setQuery] = useState(""), [search, setSearch] = useState({ status: "idle", products: [] });
  const [retrySearch, setRetrySearch] = useState(0), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [cities, setCities] = useState([]), [localities, setLocalities] = useState([]), [citiesError, setCitiesError] = useState(false);
  const [comparison, setComparison] = useState(null);
  const sequence = useRef(0), searchCache = useRef(new Map());
  const selected = lists.find((list) => list._id === selectedId);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await getShoppingLists();
      const own = data.filter((list) => list.ownerId && list.name);
      setLists(own);
      setSelectedId((id) => own.some((list) => list._id === id) ? id : own[0]?._id || "");
    } catch (err) { setError(err.message || "error"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const loadCities = useCallback(async () => {
    setCitiesError(false);
    try { const result = await getLocalities(); setLocalities(result.data || []); }
    catch { setCitiesError(true); }
  }, []);
  useEffect(() => { loadCities(); }, [loadCities]);

  useEffect(() => {
    const trimmed = query.trim(), delay = searchDelay(trimmed), current = ++sequence.current;
    const controller = new AbortController();
    if (delay === null) { setSearch({ status: "idle", products: [] }); return () => controller.abort(); }
    const key = trimmed.toLocaleLowerCase();
    const cached = searchCache.current.get(key);
    if (cached && cached.expiresAt > Date.now()) { setSearch(cached.result); return () => controller.abort(); }
    setSearch({ status: "waiting", products: [] });
    const timer = setTimeout(async () => {
      setSearch({ status: "loading", products: [] });
      try {
        const data = await searchCatalogProducts(trimmed, controller.signal);
        if (current !== sequence.current) return;
        const result = { status: "done", products: data.data?.products || [], coverage: data.data?.coverage };
        if (searchCache.current.size >= 50) searchCache.current.delete(searchCache.current.keys().next().value);
        searchCache.current.set(key, { result, expiresAt: Date.now() + 60000 });
        setSearch(result);
      } catch (err) {
        if (current !== sequence.current || controller.signal.aborted) return;
        setSearch({ status: "error", products: [], message: err.message });
      }
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, retrySearch]);

  function replaceList(list) { setLists((prev) => prev.map((entry) => entry._id === list._id ? list : entry)); setComparison(null); }
  async function run(action) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (err) { setError(err.status === 409 ? text.duplicate : err.message || text.failed); }
    finally { setBusy(false); }
  }
  function validateName() { const value = name.trim(); if (!value || value.length > 100) { setError(text.invalidName); return null; } return value; }
  const date = (value) => { const parsed = new Date(value); return value && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString(locale) : text.freshnessUnknown; };
  const money = (value) => value == null ? "—" : `₪${value}`;
  const reasons = { price_unavailable: text.unavailable, lookup_failed: text.lookup_failed, weighted_product: text.weighted_product, incompatible_or_unknown_units: text.incompatible_or_unknown_units, invalid_catalog_reference: text.invalid_catalog_reference };

  return <Card component="section" dir={direction}>
    <CardContent>
      <Stack spacing={2}>
        <Box><Typography variant="h6" fontWeight={700}>{text.title}</Typography><Typography color="text.secondary" variant="body2">{text.subtitle}</Typography></Box>
        {error && <Alert severity="error" onClose={() => setError("")}>{error}{loading === false && !lists.length && <Button size="small" onClick={load}>{text.retry}</Button>}</Alert>}
        {loading ? <CircularProgress size={22} aria-label={text.loading} /> : <>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField size="small" label={text.newList} value={name} inputProps={{ maxLength: 100 }} onChange={(e) => setName(e.target.value)} fullWidth />
            <Button variant="contained" disabled={busy} onClick={() => { const value = validateName(); if (value) run(async () => { const list = await createShoppingList({ name: value }); setLists((prev) => [list, ...prev]); setSelectedId(list._id); setName(""); setComparison(null); }); }}>{text.create}</Button>
          </Stack>
          {!lists.length ? <Typography color="text.secondary">{text.noLists}</Typography> : <>
            <TextField select size="small" label={text.selectList} value={selectedId} disabled={busy} onChange={(e) => { setSelectedId(e.target.value); setComparison(null); setRenaming(false); }} fullWidth>
              {lists.map((list) => <MenuItem key={list._id} value={list._id}>{list.name}</MenuItem>)}
            </TextField>
            {selected && <>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button size="small" disabled={busy} onClick={() => { setName(selected.name); setRenaming(true); }}>{text.rename}</Button>
                <Button size="small" color="error" disabled={busy} onClick={() => { if (window.confirm(text.confirmDelete)) run(async () => { await deleteShoppingList(selectedId); const remaining = lists.filter((list) => list._id !== selectedId); setLists(remaining); setSelectedId(remaining[0]?._id || ""); setComparison(null); }); }}>{text.delete}</Button>
              </Stack>
              {renaming && <Stack direction={{ xs: "column", sm: "row" }} spacing={1}><TextField size="small" label={text.name} value={name} inputProps={{ maxLength: 100 }} onChange={(e) => setName(e.target.value)} fullWidth /><Button disabled={busy} onClick={() => { const value = validateName(); if (value) run(async () => { replaceList(await renameComparisonList(selectedId, value)); setRenaming(false); setName(""); }); }}>{text.save}</Button><Button onClick={() => { setRenaming(false); setName(""); }}>{text.cancel}</Button></Stack>}
              <Divider />
              <TextField size="small" fullWidth label={text.search} value={query} onChange={(e) => { setQuery(e.target.value); setRetrySearch(0); }} helperText={text.hint} inputProps={{ maxLength: 100 }} />
              {(search.status === "waiting" || search.status === "loading") && <Typography variant="body2" role="status">{text.searching}</Typography>}
              {search.status === "error" && <Alert severity="error" action={<Button onClick={() => setRetrySearch((n) => n + 1)}>{text.retrySearch}</Button>}>{search.message || text.failed}</Alert>}
              {search.status === "done" && <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">{text.partial}</Typography>
                {!search.products.length && <Typography variant="body2">{text.noResults}</Typography>}
                {search.products.map((product) => { const duplicate = selectionExists(selected.items || [], product.barcodes || []); return <Stack key={`${product.name}:${product.barcodes.join(",")}`} direction="row" spacing={1} alignItems="center" justifyContent="space-between"><Box sx={{ minWidth: 0 }}><Typography>{product.name}</Typography><Typography variant="caption" color="text.secondary">{product.barcodes?.length || 0} {text.codes} · {product.basis === "kg" ? text.perKg : product.basis === "package" ? `${product.package.quantity} ${product.package.unit} × ${product.package.count}` : `${text.unknownPackage} · ${product.barcodes[0]}`}</Typography></Box><Button size="small" variant="outlined" disabled={busy || duplicate || !product.barcodes?.length} onClick={() => run(async () => { replaceList(await addComparisonItem(selectedId, product.barcodes)); setQuery(""); })}>{duplicate ? text.added : text.add}</Button></Stack>; })}
              </Stack>}
              <Divider />
              {!(selected.items || []).length && <Typography color="text.secondary">{text.empty}</Typography>}
              {(selected.items || []).map((item) => <Stack key={item._id} direction="row" spacing={1} alignItems="center"><Box sx={{ flex: 1, minWidth: 0 }}><Typography>{itemName(item, text.invalidNameData)}</Typography>{item.selectionType === "same_name" && <Typography variant="caption" color="text.secondary">{item.productIds?.length || 0} {text.codes}</Typography>}</Box><QuantityInput item={item} label={text.qty} fallback={text.product} disabled={busy} onInvalid={() => setError(text.invalidQuantity)} onSave={(value) => run(async () => replaceList(await changeComparisonQuantity(selectedId, item._id, value)))} /><IconButton aria-label={`${text.remove} ${itemName(item, text.product)}`} disabled={busy} onClick={() => run(async () => replaceList(await removeComparisonItem(selectedId, item._id)))}><DeleteOutlineIcon /></IconButton></Stack>)}
              <Divider />
              {citiesError && <Alert severity="error" action={<Button onClick={loadCities}>{text.retry}</Button>}>{text.citiesError}</Alert>}
              <Autocomplete multiple options={localities} value={cities} disabled={busy || citiesError} isOptionEqualToValue={(a, b) => a.id === b.id} getOptionLabel={(option) => String(locale || "").startsWith("he") ? option.name : `${option.english} (${option.name})`} filterSelectedOptions filterOptions={(options, { inputValue }) => { const query = inputValue.trim().toLocaleLowerCase(); return options.filter((option) => [option.name, option.english].some((name) => name?.toLocaleLowerCase().includes(query))); }} onChange={(_, value) => { setCities(value); setComparison(null); }} renderInput={(params) => <TextField {...params} size="small" label={text.cities} placeholder={text.searchCities} helperText={text.citiesHint} />} />
              <Button variant="contained" disabled={busy || !selected.items?.length || !cities.length} onClick={() => run(async () => { setComparison(null); setComparison(await compareShoppingList(selectedId, { cities: cities.map((city) => city.id) })); })}>{busy ? text.loading : text.compare}</Button>
              {comparison && <Stack spacing={1.5} aria-live="polite"><Divider /><Typography variant="caption">{text.compared}: {date(comparison.comparedAt)}</Typography><Typography variant="caption" color="text.secondary">{text.stock} {text.notAll}</Typography>{comparison.comparisonIncomplete && <Alert severity="warning">{text.partialResult}</Alert>}{Boolean(comparison.lookupFailures?.length || comparison.invalidItems?.length) && <Typography color="warning.main" variant="body2">{text.sourceFailure}</Typography>}{!comparison.stores?.length && <Alert severity="info">{text.noStores}</Alert>}
                {(comparison.stores || []).map((result) => { const ranked = validRank(result, comparison); const cheapest = ranked && result.rank === 1; return <Box key={result.store.id} sx={{ border: "1px solid", borderColor: cheapest ? "success.main" : "divider", borderRadius: 2, p: 1.5 }}><Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}><Box><Typography fontWeight={700}>{result.store.name || text.unknown}</Typography><Typography variant="body2" color="text.secondary">{[result.store.chain, result.store.city, result.store.address].filter(Boolean).join(" · ")}</Typography></Box><Chip size="small" color={cheapest ? "success" : "default"} label={cheapest ? text.cheapest : result.complete ? `${text.complete}${ranked ? ` #${result.rank}` : ""}` : text.incomplete} /></Stack><Typography sx={{ mt: 1 }} fontWeight={700}>{result.complete ? text.total : text.subtotal}: {money(result.complete ? result.totalPrice : result.knownSubtotal)}</Typography>{(result.selectedProducts || []).map((product) => <Box key={product.itemId} sx={{ mt: 1 }}><Typography variant="body2">{product.product?.name || text.product} × {product.quantity}{product.priceBasis === "kg" ? ` ${text.kilogram}` : ""} · {money(product.unitPrice)}{product.priceBasis === "kg" ? ` / ${text.kilogram}` : ""} → {money(product.subtotal)}</Typography><Typography variant="caption" color="text.secondary">{product.product?.barcode} · {text.updated}: {date(product.priceUpdateDate)}{product.inferredWeighted ? ` · ${text.inferredWeight}` : ""}</Typography></Box>)}{result.missingItems?.length > 0 && <Box sx={{ mt: 1 }}><Typography variant="body2" fontWeight={700}>{text.missing}</Typography>{result.missingItems.map((missing) => <Typography variant="body2" key={missing.itemId}>{itemName(selected.items.find((item) => item._id === missing.itemId) || {}, text.product)}: {reasons[missing.reason] || missing.reason}{missing.reason === "incompatible_or_unknown_units" ? ` — ${text.repairSelection}` : ""}</Typography>)}</Box>}</Box>; })}
              </Stack>}
            </>}
          </>}
        </>}
        <Typography variant="caption" color="text.secondary">{text.legacy}</Typography>
      </Stack>
    </CardContent>
  </Card>;
}
