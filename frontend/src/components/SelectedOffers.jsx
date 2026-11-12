import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ShoppingBasketOutlinedIcon from "@mui/icons-material/ShoppingBasketOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import {
  createShoppingList,
  deleteShoppingList,
  getLocalities,
  getShoppingLists,
  getWizOffers,
  refreshSelectedOffer,
  removeComparisonItem,
  saveSelectedOffer,
  searchWizProducts,
  setListCities,
} from "../services/shoppingListService";

const copy = {
  he: {
    title: "רשימת קניות לפי חנות",
    subtitle: "בחרו מוצר, סניף ומחיר לכל פריט.",
    newList: "שם רשימה חדשה",
    create: "יצירת רשימה",
    chooseList: "בחירת רשימה",
    removeList: "מחיקת הרשימה",
    confirm: "למחוק את הרשימה?",
    cities: "ערים לחיפוש",
    cityHelp: "בחרו עד 10 ערים. הבחירה נשמרת ברשימה.",
    search: "חיפוש מוצר",
    searchHelp: "הקלידו לפחות 3 תווים.",
    searching: "מחפש…",
    noProducts: "לא נמצאו מוצרים.",
    showMore: "הצגת מוצרים נוספים",
    choose: "הצגת חנויות",
    close: "סגירה",
    offers: "חנויות ומחירים",
    add: "הוספה לרשימה",
    noOffers: "לא נמצאו הצעות בערים שנבחרו.",
    noCities: "בחרו ערים לפני חיפוש מחירים.",
    limit: "מוצגות עד 5 חנויות לכל מוצר ועיר; ייתכנו חנויות נוספות.",
    national: "מחיר מינימלי ארצי",
    openPromo: "כרגע במבצע",
    shelf: "מחיר רגיל",
    price: "מחיר",
    saved: "מחיר שנשמר",
    asOf: "נכון ליום",
    refreshed: "נבדק",
    refresh: "רענון מחיר",
    refreshFailed: "לא ניתן לרענן את המחיר; המחיר השמור לא השתנה.",
    remove: "הסרה",
    total: "סה״כ הבחירות",
    subtotal: "סה״כ בחנות",
    unknown: "לא ידוע",
    disclaimer:
      "המחיר הוא הצעה שנשמרה עבור יחידה אחת לפי נתוני WizStore; תנאי המבצע והמחיר בקופה עשויים להשתנות. יש לוודא את יחידת המידה לפני הקנייה.",
    source: "מקור: WizStore",
    partial: "חלק מהערים לא הוחזרו:",
    error: "אירעה שגיאה.",
    empty: "אין הצעות ברשימה.",
    loading: "טוען…",
    dates: "המחיר עודכן לפי הנתונים הזמינים",
    setup: "הגדרת הרשימה",
    savedSection: "הבחירות שלי",
    results: "תוצאות חיפוש",
  },
  en: {
    title: "Shopping list by store",
    subtitle: "Choose a product, store and price for each item.",
    newList: "New list name",
    create: "Create list",
    chooseList: "Choose list",
    removeList: "Delete list",
    confirm: "Delete this list?",
    cities: "Search cities",
    cityHelp: "Select up to 10 cities. Your choices are saved with this list.",
    search: "Search products",
    searchHelp: "Enter at least 3 characters.",
    searching: "Searching…",
    noProducts: "No products found.",
    showMore: "Show more",
    choose: "View store prices",
    close: "Close",
    offers: "Stores and prices",
    add: "Add to list",
    noOffers: "No offers found in the selected cities.",
    noCities: "Choose cities before looking up offers.",
    limit:
      "Up to 5 stores per product and city; other stores may be available.",
    national: "National minimum",
    openPromo: "After open promotions",
    shelf: "Shelf price",
    price: "Price",
    saved: "Saved price",
    asOf: "Data as of",
    refreshed: "Checked",
    refresh: "Refresh price",
    refreshFailed: "Could not refresh the price; the saved price was kept.",
    remove: "Remove",
    total: "Total selected offers",
    subtotal: "Store subtotal",
    unknown: "Unknown",
    disclaimer:
      "Each saved quote is for one unit as reported by WizStore; promotion terms and checkout prices may change. Verify the unit of measure before buying.",
    source: "Source: WizStore",
    partial: "Some cities could not be searched:",
    error: "Something went wrong.",
    empty: "No offers in this list.",
    loading: "Loading…",
    dates: "Price date based on available data",
    setup: "List settings",
    savedSection: "Your selections",
    results: "Search results",
  },
};
const money = (n) =>
  n != null && Number.isFinite(Number(n)) ? `₪${Number(n).toFixed(2)}` : "—";
const byPrice = (field) => (a, b) => {
  const value = (item) =>
    item[field] != null && Number.isFinite(Number(item[field]))
      ? Number(item[field])
      : Infinity;
  return value(a) - value(b);
};
export default function SelectedOffers() {
  const { locale, direction } = useLanguage();
  const he = String(locale || "").startsWith("he");
  const t = he ? copy.he : copy.en;
  const [lists, setLists] = useState([]),
    [selectedId, setSelectedId] = useState(""),
    [localities, setLocalities] = useState([]),
    [name, setName] = useState(""),
    [query, setQuery] = useState(""),
    [products, setProducts] = useState([]),
    [visibleCount, setVisibleCount] = useState(7),
    [product, setProduct] = useState(null),
    [offers, setOffers] = useState([]),
    [failures, setFailures] = useState([]),
    [busy, setBusy] = useState(false),
    [searching, setSearching] = useState(false),
    [lookedUp, setLookedUp] = useState(false),
    [searched, setSearched] = useState(false),
    [error, setError] = useState("");
  const selected = lists.find((x) => x._id === selectedId);
  const cities = useMemo(
    () =>
      localities.filter((c) => (selected?.selectedCities || []).includes(c.id)),
    [localities, selected],
  );
  const saved = (selected?.items || []).filter(
    (x) => x.selectionType === "offer" && x.offer,
  );
  const groups = useMemo(() => {
    const m = new Map();
    for (const item of saved) {
      const o = item.offer,
        k = `${o.cityId}:${o.chainKey}:${o.storeId}`;
      if (!m.has(k)) m.set(k, { offer: o, items: [], cents: 0 });
      const g = m.get(k);
      g.items.push(item);
      g.cents += Math.round(Number(o.price) * 100);
    }
    return [...m.values()];
  }, [selected]);
  const replace = (list) =>
    setLists((prev) => prev.map((x) => (x._id === list._id ? list : x)));
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message || t.error);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    Promise.all([getShoppingLists(), getLocalities()])
      .then(([data, loc]) => {
        if (!active) return;
        const own = data.filter((x) => x.ownerId && x.name);
        setLists(own);
        setSelectedId(own[0]?._id || "");
        setLocalities(loc.data || []);
      })
      .catch((e) => active && setError(e.message || t.error));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const q = query.trim();
    setVisibleCount(7);
    setProducts([]);
    setProduct(null);
    setOffers([]);
    setFailures([]);
    setLookedUp(false);
    setSearched(false);
    if ([...q].length < 3) {
      setProducts([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await searchWizProducts(q, controller.signal);
        if (!controller.signal.aborted) {
          setProducts([...(r.data || [])].sort(byPrice("minEffective")));
          setSearched(true);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e.message || t.error);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  function asOfDate(value) {
    if (!value) return t.unknown;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T| )/);
    if (match) return `${Number(match[3])}/${Number(match[2])}/${match[1].slice(-2)}`;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return `${parsed.getDate()}/${parsed.getMonth() + 1}/${String(parsed.getFullYear()).slice(-2)}`;
  }
  function date(v) {
    return v ? new Date(v).toLocaleDateString(locale || undefined) : t.unknown;
  }
  return (
    <Card component="section" dir={direction} sx={{ overflow: "hidden" }}>
      <CardContent
        sx={{ p: { xs: 2, sm: 3 }, "&:last-child": { pb: { xs: 2, sm: 3 } } }}
      >
        <Stack spacing={3}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                display: "grid",
                placeItems: "center",
                width: 48,
                height: 48,
                borderRadius: 1.5,
                bgcolor: "action.selected",
                color: "primary.main",
                flexShrink: 0,
              }}
            >
              <ShoppingBasketOutlinedIcon />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={750} lineHeight={1.25}>
                {t.title}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                {t.subtitle}
              </Typography>
            </Box>
          </Stack>
          {error && (
            <Alert severity="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <Box
            sx={{
              p: { xs: 2, sm: 2.5 },
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              bgcolor: "action.hover",
            }}
          >
            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight={700}>
                {t.setup}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  size="small"
                  fullWidth
                  label={t.newList}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  inputProps={{ maxLength: 100 }}
                />
                <Button
                  variant="contained"
                  sx={{ whiteSpace: "nowrap", minHeight: 40 }}
                  disabled={busy || !name.trim()}
                  onClick={() =>
                    run(async () => {
                      const x = await createShoppingList({ name: name.trim() });
                      setLists((p) => [x, ...p]);
                      setSelectedId(x._id);
                      setName("");
                    })
                  }
                >
                  {t.create}
                </Button>
              </Stack>
              {!!lists.length && (
                <TextField
                  select
                  fullWidth
                  size="small"
                  label={t.chooseList}
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setOffers([]);
                    setProduct(null);
                    setLookedUp(false);
                  }}
                >
                  {lists.map((x) => (
                    <MenuItem key={x._id} value={x._id}>
                      {x.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {selected && (
                <>
                  <Button
                    color="error"
                    size="small"
                    startIcon={<DeleteOutlineIcon />}
                    sx={{ alignSelf: "flex-start" }}
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(t.confirm))
                        run(async () => {
                          await deleteShoppingList(selectedId);
                          const rest = lists.filter(
                            (x) => x._id !== selectedId,
                          );
                          setLists(rest);
                          setSelectedId(rest[0]?._id || "");
                        });
                    }}
                  >
                    {t.removeList}
                  </Button>
                  <Autocomplete
                    multiple
                    options={localities}
                    value={cities}
                    disabled={busy}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    getOptionDisabled={(o) =>
                      cities.length >= 10 && !cities.some((c) => c.id === o.id)
                    }
                    getOptionLabel={(o) =>
                      he ? o.name : `${o.english} (${o.name})`
                    }
                    filterSelectedOptions
                    onChange={(_, value) =>
                      run(async () => {
                        replace(
                          await setListCities(
                            selectedId,
                            value.map((x) => x.id),
                          ),
                        );
                        setOffers([]);
                        setLookedUp(false);
                      })
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        label={t.cities}
                        helperText={t.cityHelp}
                      />
                    )}
                  />
                </>
              )}
            </Stack>
          </Box>
          {selected && (
            <>
              <Box>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mb: 1.5 }}
                >
                  <SearchOutlinedIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle1" fontWeight={700}>
                    {t.search}
                  </Typography>
                </Stack>
                <TextField
                  fullWidth
                  size="small"
                  label={t.search}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  helperText={t.searchHelp}
                />
                {searching && (
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    role="status"
                    sx={{ mt: 2, color: "text.secondary" }}
                  >
                    <CircularProgress size={16} />
                    <Typography variant="body2">{t.searching}</Typography>
                  </Stack>
                )}
                {searched && !products.length && (
                  <Typography color="text.secondary" sx={{ mt: 2 }}>
                    {t.noProducts}
                  </Typography>
                )}
                {!!products.length && (
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{ display: "block", mt: 2, mb: 0.5, fontWeight: 700 }}
                  >
                    {t.results}
                  </Typography>
                )}
                <Stack spacing={1}>
                  {products.slice(0, visibleCount).map((p) => (
                    <Box
                      key={p.code}
                      sx={{
                        border: 1,
                        borderColor:
                          product?.code === p.code ? "primary.main" : "divider",
                        borderRadius: 1.5,
                        p: 1.5,
                        transition:
                          "border-color 180ms ease, box-shadow 180ms ease",
                        "&:hover": { boxShadow: 1 },
                        "@media (prefers-reduced-motion: reduce)": {
                          transition: "none",
                        },
                      }}
                    >
                      <Stack spacing={1} alignItems="stretch">
                        <Stack
                          direction="row"
                          spacing={1.5}
                          justifyContent="space-between"
                          alignItems="flex-start"
                        >
                          <Typography fontWeight={600}>{p.name}</Typography>
                          {p.minEffective != null && (
                            <Typography
                              variant="body2"
                              fontWeight={700}
                              color="primary.main"
                              sx={{
                                whiteSpace: "nowrap",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {money(p.minEffective)}
                            </Typography>
                          )}
                        </Stack>
                        <Button
                          size="small"
                          variant={
                            product?.code === p.code ? "contained" : "outlined"
                          }
                          sx={{ alignSelf: { xs: "stretch", sm: "flex-end" } }}
                          disabled={busy || !cities.length}
                          aria-expanded={product?.code === p.code}
                          onClick={() => {
                            if (product?.code === p.code) {
                              setProduct(null);
                              return;
                            }
                            run(async () => {
                              setProduct(p);
                              setOffers([]);
                              setFailures([]);
                              setLookedUp(false);
                              const r = await getWizOffers(
                                p.code,
                                cities.map((c) => c.id),
                              );
                              setOffers(
                                [...(r.data.offers || [])].sort(
                                  byPrice("price"),
                                ),
                              );
                              setFailures(r.data.failedCities || []);
                              setLookedUp(true);
                            });
                          }}
                        >
                          {product?.code === p.code ? t.close : t.choose}
                        </Button>
                      </Stack>
                      {product?.code === p.code && (
                        <Stack
                          spacing={1.5}
                          sx={{
                            mt: 1.5,
                            pt: 1.5,
                            borderTop: 1,
                            borderColor: "divider",
                          }}
                        >
                          <Typography fontWeight={700}>{t.offers}</Typography>
                          {/* <Typography variant="caption" color="text.secondary">
                            {t.limit}
                          </Typography> */}
                          {busy && <CircularProgress size={20} />}
                          {!!failures.length && (
                            <Alert severity="warning">
                              {t.partial}{" "}
                              {failures
                                .map((x) => `${x.city}: ${x.message}`)
                                .join("; ")}
                            </Alert>
                          )}
                          {lookedUp && !offers.length && (
                            <Typography>{t.noOffers}</Typography>
                          )}
                          {offers.map((o) => (
                            <Stack
                              key={`${o.cityId}:${o.chainKey}:${o.storeId}`}
                              direction={{ xs: "column", sm: "row" }}
                              spacing={1}
                              justifyContent="space-between"
                              alignItems={{ xs: "stretch", sm: "center" }}
                              sx={{
                                p: 1.5,
                                borderRadius: 1,
                                bgcolor: "action.hover",
                              }}
                            >
                              <Box>
                                <Typography fontWeight={600}>
                                  {o.chainName} · {o.storeName} · {o.city}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  {o.price != null && o.shelfPrice != null && Number(o.price) === Number(o.shelfPrice)
                                    ? `${t.price}: ${money(o.shelfPrice)}`
                                    : `${t.openPromo}: ${money(o.price)}${o.shelfPrice != null ? ` · ${t.shelf}: ${money(o.shelfPrice)}` : ""}`}{" "}
                                  · {t.asOf}: {asOfDate(o.asOf)}
                                </Typography>
                              </Box>
                              <Button
                                disabled={busy}
                                size="small"
                                variant="outlined"
                                sx={{ flexShrink: 0 }}
                                onClick={() =>
                                  run(async () => {
                                    replace(
                                      await saveSelectedOffer(selectedId, o),
                                    );
                                    setQuery("");
                                  })
                                }
                              >
                                {t.add}
                              </Button>
                            </Stack>
                          ))}
                        </Stack>
                      )}
                    </Box>
                  ))}
                </Stack>
                {visibleCount < products.length && (
                  <Button
                    size="small"
                    onClick={() => setVisibleCount((count) => count + 7)}
                  >
                    {t.showMore}
                  </Button>
                )}
                {!cities.length && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 1 }}
                  >
                    {t.noCities}
                  </Typography>
                )}
              </Box>
              <Divider />
              <Box>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", sm: "center" }}
                  sx={{ mb: 2 }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <StorefrontOutlinedIcon color="primary" fontSize="small" />
                    <Typography variant="subtitle1" fontWeight={700}>
                      {t.savedSection}
                    </Typography>
                  </Stack>
                  <Box
                    sx={{
                      px: 1.5,
                      py: 0.75,
                      borderRadius: 1,
                      bgcolor: "action.selected",
                    }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      component="span"
                    >
                      {t.total}:{" "}
                    </Typography>
                    <Typography
                      component="span"
                      fontWeight={750}
                      color="primary.main"
                      sx={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {money(groups.reduce((sum, g) => sum + g.cents, 0) / 100)}
                    </Typography>
                  </Box>
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 2 }}
                >
                  {t.disclaimer}
                </Typography>
                {!saved.length && (
                  <Box
                    sx={{
                      p: 3,
                      textAlign: "center",
                      border: "1px dashed",
                      borderColor: "divider",
                      borderRadius: 1.5,
                      color: "text.secondary",
                    }}
                  >
                    <Typography variant="body2">{t.empty}</Typography>
                  </Box>
                )}
                <Stack spacing={1.5}>
                  {groups.map((g) => (
                    <Box
                      key={`${g.offer.cityId}:${g.offer.chainKey}:${g.offer.storeId}`}
                      sx={{
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={0.5}
                        justifyContent="space-between"
                        sx={{ p: 1.5, bgcolor: "action.hover" }}
                      >
                        <Typography fontWeight={700}>
                          {g.offer.chainName} · {g.offer.storeName} ·{" "}
                          {g.offer.city}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {t.subtotal}:{" "}
                          <Box
                            component="span"
                            sx={{
                              color: "text.primary",
                              fontWeight: 700,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {money(g.cents / 100)}
                          </Box>
                        </Typography>
                      </Stack>
                      {g.items.map((item) => (
                        <Stack
                          key={item._id}
                          direction={{ xs: "column", sm: "row" }}
                          justifyContent="space-between"
                          alignItems={{ xs: "stretch", sm: "center" }}
                          spacing={1}
                          sx={{
                            p: 1.5,
                            borderTop: 1,
                            borderColor: "divider",
                            transition: "background-color 180ms ease",
                            "&:hover": { bgcolor: "action.hover" },
                            "@media (prefers-reduced-motion: reduce)": {
                              transition: "none",
                            },
                          }}
                        >
                          <Box>
                            <Typography fontWeight={600}>
                              {item.offer.name} · {money(item.offer.price)}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {t.asOf}: {asOfDate(item.offer.asOf)} ·{" "}
                              {t.refreshed}: {date(item.offer.fetchedAt)} ·{" "}
                              <a
                                href="https://wizbi.store"
                                target="_blank"
                                rel="noreferrer"
                              >
                                {t.source}
                              </a>
                            </Typography>
                          </Box>
                          <Stack direction="row">
                            <Button
                              size="small"
                              disabled={busy}
                              onClick={() =>
                                run(async () =>
                                  replace(
                                    await refreshSelectedOffer(
                                      selectedId,
                                      item._id,
                                    ),
                                  ),
                                )
                              }
                            >
                              {t.refresh}
                            </Button>
                            <IconButton
                              aria-label={`${t.remove} ${item.offer.name}`}
                              disabled={busy}
                              onClick={() =>
                                run(async () =>
                                  replace(
                                    await removeComparisonItem(
                                      selectedId,
                                      item._id,
                                    ),
                                  ),
                                )
                              }
                            >
                              <DeleteOutlineIcon />
                            </IconButton>
                          </Stack>
                        </Stack>
                      ))}
                    </Box>
                  ))}
                </Stack>
              </Box>
            </>
          )}
          <Typography variant="caption" color="text.secondary">
            <a href="https://wizbi.store" target="_blank" rel="noreferrer">
              {t.source}
            </a>
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
