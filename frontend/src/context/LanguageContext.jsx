import { createContext, useContext, useEffect, useMemo, useState } from "react";

const LANGUAGE_STORAGE_KEY = "app_language";
const FALLBACK_LANGUAGE = "en";
const SUPPORTED_LANGUAGES = new Set(["en", "he"]);

const MESSAGES = {
  en: {
    appTitle: "Money Sync",
    dashboard: "Dashboard",
    expenses: "Expenses",
    shoppingLists: "Shopping Lists",
    bank: "Bank",
    logout: "Logout",
    language: "Language",
    english: "English",
    hebrew: "Hebrew",
    englishWithFlag: "🇺🇸 USA - English",
    hebrewWithFlag: "🇮🇱 Israel - Hebrew",
    login: "Login",
    createAccount: "Create account",
    register: "Register",
    switchToLogin: "Switch to login",
    switchToRegister: "Switch to register",
    name: "Name",
    email: "Email",
    password: "Password",
    allExpenses: "All expenses",
    addExpense: "Add expense",
    amount: "Amount",
    description: "Description",
    category: "Category",
    save: "Save",
    reviewed: "Reviewed",
    markReviewed: "Mark reviewed",
    source: "Source",
    merchant: "Merchant",
    externalId: "External ID",
    yes: "Yes",
    no: "No",
    tags: "Tags",
    notes: "Notes",
    created: "Created",
    updated: "Updated",
    showDetails: "Show details",
    hideDetails: "Hide details",
    date: "Date",
    categoryFilter: "Category filter",
    allCategories: "All categories",
    sortBy: "Sort by",
    sortDateNewest: "Date: newest first",
    sortDateOldest: "Date: oldest first",
    sortPriceHighToLow: "Price: high to low",
    sortPriceLowToHigh: "Price: low to high",
    general: "General",
    createShoppingList: "Create shopping list",
    title: "Title",
    weeklyGroceries: "Weekly groceries",
    create: "Create",
    done: "Done",
    markDone: "Mark done",
    sampleMilk: "Milk",
    sampleBread: "Bread",
    bankCredentials: "Bank credentials",
    configureBankCredentials: "Configure credentials used by bank sync for your account.",
    status: "Status",
    loading: "Loading...",
    connected: "Connected",
    notConnected: "Not connected",
    lastUpdated: "Last updated",
    bankOrCreditCardCompany: "Bank / Credit Card Company",
    required: "Required",
    optional: "Optional",
    saveCredentials: "Save credentials",
    disconnect: "Disconnect",
    bankCredentialsSaved: "Bank credentials saved.",
    bankCredentialsRemoved: "Bank credentials removed.",
    failedLoadBankStatus: "Failed to load bank connection status",
    failedSaveBankCredentials: "Failed to save bank credentials",
    failedRemoveBankCredentials: "Failed to remove bank credentials",
  },
  he: {
    appTitle: "Money Sync",
    dashboard: "לוח בקרה",
    expenses: "הוצאות",
    shoppingLists: "רשימות קניות",
    bank: "בנק",
    logout: "התנתק",
    language: "שפה",
    english: "אנגלית",
    hebrew: "עברית",
    englishWithFlag: "🇺🇸 ארצות הברית - אנגלית",
    hebrewWithFlag: "🇮🇱 ישראל - עברית",
    login: "התחברות",
    createAccount: "יצירת חשבון",
    register: "הרשמה",
    switchToLogin: "מעבר להתחברות",
    switchToRegister: "מעבר להרשמה",
    name: "שם",
    email: "אימייל",
    password: "סיסמה",
    allExpenses: "כל ההוצאות",
    addExpense: "הוספת הוצאה",
    amount: "סכום",
    description: "תיאור",
    category: "קטגוריה",
    save: "שמירה",
    reviewed: "נבדק",
    markReviewed: "סמן כנבדק",
    source: "מקור",
    merchant: "בית עסק",
    externalId: "מזהה חיצוני",
    yes: "כן",
    no: "לא",
    tags: "תגיות",
    notes: "הערות",
    created: "נוצר",
    updated: "עודכן",
    showDetails: "הצג פרטים",
    hideDetails: "הסתר פרטים",
    date: "תאריך",
    categoryFilter: "סינון לפי קטגוריה",
    allCategories: "כל הקטגוריות",
    sortBy: "מיון לפי",
    sortDateNewest: "תאריך: מהחדש לישן",
    sortDateOldest: "תאריך: מהישן לחדש",
    sortPriceHighToLow: "מחיר: מהגבוה לנמוך",
    sortPriceLowToHigh: "מחיר: מהנמוך לגבוה",
    general: "כללי",
    createShoppingList: "יצירת רשימת קניות",
    title: "כותרת",
    weeklyGroceries: "קניות שבועיות",
    create: "יצירה",
    done: "בוצע",
    markDone: "סמן כבוצע",
    sampleMilk: "חלב",
    sampleBread: "לחם",
    bankCredentials: "פרטי התחברות לבנק",
    configureBankCredentials: "הגדר את פרטי ההתחברות לסנכרון הבנק עבור החשבון שלך.",
    status: "סטטוס",
    loading: "טוען...",
    connected: "מחובר",
    notConnected: "לא מחובר",
    lastUpdated: "עודכן לאחרונה",
    bankOrCreditCardCompany: "בנק / חברת אשראי",
    required: "חובה",
    optional: "אופציונלי",
    saveCredentials: "שמירת פרטי התחברות",
    disconnect: "ניתוק",
    bankCredentialsSaved: "פרטי ההתחברות לבנק נשמרו.",
    bankCredentialsRemoved: "פרטי ההתחברות לבנק הוסרו.",
    failedLoadBankStatus: "טעינת סטטוס החיבור לבנק נכשלה",
    failedSaveBankCredentials: "שמירת פרטי ההתחברות לבנק נכשלה",
    failedRemoveBankCredentials: "הסרת פרטי ההתחברות לבנק נכשלה",
  },
};

const LanguageContext = createContext(null);

function getInitialLanguage() {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved && SUPPORTED_LANGUAGES.has(saved)) {
    return saved;
  }
  return FALLBACK_LANGUAGE;
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);
  const direction = language === "he" ? "rtl" : "ltr";

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    document.body.dir = direction;
  }, [language, direction]);

  const value = useMemo(
    () => ({
      language,
      direction,
      locale: language === "he" ? "he-IL" : "en-US",
      setLanguage,
      t: (key) => MESSAGES[language]?.[key] || MESSAGES.en[key] || key,
    }),
    [direction, language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}
