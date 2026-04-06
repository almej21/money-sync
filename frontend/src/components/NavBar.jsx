import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import LogoutIcon from "@mui/icons-material/Logout";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import WalletIcon from "@mui/icons-material/Wallet";
import {
  alpha,
  AppBar,
  Badge,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  Stack,
  Tooltip,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import israelFlagIcon from "../assets/icons/israel.png";
import usaFlagIcon from "../assets/icons/united-states.png";
import { SHOW_SCREEN_SIZE_INDICATOR } from "../constants/debug";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { getMyHouseholdInvitations } from "../services/householdService";

export default function NavBar() {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isXsOnly = useMediaQuery(theme.breakpoints.only("xs"));
  const isSmOnly = useMediaQuery(theme.breakpoints.only("sm"));
  const isMdOnly = useMediaQuery(theme.breakpoints.only("md"));
  const isLgOnly = useMediaQuery(theme.breakpoints.only("lg"));
  const isXlUp = useMediaQuery(theme.breakpoints.up("xl"));
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileHeaderHeight, setMobileHeaderHeight] = useState(0);
  const [pendingInvitationCount, setPendingInvitationCount] = useState(0);
  const appBarRef = useRef(null);
  const nextLanguage = language === "en" ? "he" : "en";
  const toggleLanguage = () => setLanguage(nextLanguage);
  const nextLanguageFlagIcon = nextLanguage === "en" ? usaFlagIcon : israelFlagIcon;
  const openLogoutModal = () => setIsLogoutModalOpen(true);
  const closeLogoutModal = () => setIsLogoutModalOpen(false);
  const confirmLogout = () => {
    setIsLogoutModalOpen(false);
    logout();
  };

  useEffect(() => {
    if (!isMobile) return;
    const onScroll = () => setIsScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMobile]);

  useEffect(() => {
    if (!user) {
      setPendingInvitationCount(0);
      return;
    }

    let isMounted = true;

    async function refreshInvitationCount() {
      try {
        const data = await getMyHouseholdInvitations();
        if (!isMounted) return;
        const invitations = Array.isArray(data?.invitations) ? data.invitations : [];
        setPendingInvitationCount(invitations.length);
      } catch {
        if (!isMounted) return;
        setPendingInvitationCount(0);
      }
    }

    refreshInvitationCount().catch(() => {});
    const timer = setInterval(() => {
      refreshInvitationCount().catch(() => {});
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [user, location.pathname]);

  const hasPendingInvitations = pendingInvitationCount > 0;

  useEffect(() => {
    if (!isMobile) return;
    const updateHeaderHeight = () => {
      const next = appBarRef.current?.offsetHeight || 0;
      setMobileHeaderHeight(next);
    };
    updateHeaderHeight();
    window.addEventListener("resize", updateHeaderHeight);
    return () => window.removeEventListener("resize", updateHeaderHeight);
  }, [isMobile]);

  const mobileNavButtonSx = {
    justifyContent: "center",
    px: 2,
    borderRadius: 1,
    color: "inherit",
    minHeight: 40,
    "&:hover": {
      bgcolor: alpha(theme.palette.primary.dark, 0.2),
    },
  };

  const NavButtonSx = {
    "&:hover": {
      bgcolor: alpha(theme.palette.primary.dark, 0.2),
    },
  };

  const navIconSx = { fontSize: 26 };
  const currentScreenSize = isXlUp
    ? "xl"
    : isLgOnly
      ? "lg"
      : isMdOnly
        ? "md"
        : isSmOnly
          ? "sm"
          : isXsOnly
            ? "xs"
            : "unknown";
  const isRouteActive = (path) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const getNavButtonSx = (path, isMobileNav = false) => {
    const active = isRouteActive(path);
    const base = isMobileNav ? mobileNavButtonSx : NavButtonSx;

    return {
      ...base,
      bgcolor: active ? alpha(theme.palette.primary.dark, 0.32) : "transparent",
      boxShadow: active
        ? `inset 0 0 0 1px ${alpha(theme.palette.primary.contrastText, 0.22)}`
        : "none",
      "&:hover": {
        bgcolor: active
          ? alpha(theme.palette.primary.dark, 0.32)
          : alpha(theme.palette.primary.dark, 0.2),
      },
    };
  };

  return (
    <>
      <AppBar
        ref={appBarRef}
        position="static"
        color="inherit"
        elevation={0}
        sx={{ boxShadow: "none", borderTop: "none" }}
      >
      <Toolbar
        sx={{
          py: isMobile ? 1 : 0.5,
          px: { xs: 2, sm: 3 },
          display: "flex",
          alignItems: "center",
        }}
      >
        <Typography
          variant={isMobile ? "subtitle1" : "h6"}
          sx={{
            flexGrow: 1,
            fontWeight: 700,
            minWidth: 0,
            pr: 1,
          }}
        >
          {t("appTitle")}
        </Typography>
        {SHOW_SCREEN_SIZE_INDICATOR && (
          <Typography
            variant="caption"
            sx={{
              mr: 1.5,
              px: 1,
              py: 0.25,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.primary.dark, 0.2),
              color: "inherit",
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            {currentScreenSize}
          </Typography>
        )}
        {user &&
          (isMobile ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Tooltip title={t("account")}>
                <Button
                  component={Link}
                  to="/account"
                  color="inherit"
                  aria-label={t("account")}
                  sx={{ ...mobileNavButtonSx, minWidth: 0 }}
                >
                  <Badge
                    color="error"
                    variant="dot"
                    invisible={!hasPendingInvitations}
                    overlap="circular"
                    anchorOrigin={{ vertical: "top", horizontal: "right" }}
                  >
                    <ManageAccountsIcon />
                  </Badge>
                </Button>
              </Tooltip>
              <Tooltip title={t("language")}>
                <Button
                  onClick={toggleLanguage}
                  aria-label={t("language")}
                  title={nextLanguage === "en" ? t("english") : t("hebrew")}
                  sx={{
                    minWidth: 0,
                    px: 1,
                    py: 0.6,
                    borderRadius: 2,
                  }}
                >
                  <Box
                    component="img"
                    src={nextLanguageFlagIcon}
                    alt={nextLanguage === "en" ? t("english") : t("hebrew")}
                    sx={{ width: 20, height: 20, display: "block" }}
                  />
                </Button>
              </Tooltip>
              <Tooltip title={t("logout")}>
                <Button
                  color="inherit"
                  onClick={openLogoutModal}
                  aria-label={t("logout")}
                  sx={{ ...mobileNavButtonSx, minWidth: 0 }}
                >
                  <LogoutIcon />
                </Button>
              </Tooltip>
            </Stack>
          ) : (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ flexWrap: "wrap" }}
            >
              <Tooltip title={t("dashboard")}>
                <Button
                  component={Link}
                  to="/"
                  color="inherit"
                  aria-label={t("dashboard")}
                  sx={getNavButtonSx("/")}
                >
                  <FormatListBulletedIcon sx={navIconSx} />
                </Button>
              </Tooltip>
              <Tooltip title={t("shoppingLists")}>
                <Button
                  component={Link}
                  to="/shopping-lists"
                  color="inherit"
                  aria-label={t("shoppingLists")}
                  sx={getNavButtonSx("/shopping-lists")}
                >
                  <AddShoppingCartIcon sx={navIconSx} />
                </Button>
              </Tooltip>
              <Tooltip title={t("bank")}>
                <Button
                  component={Link}
                  to="/bank"
                  color="inherit"
                  aria-label={t("bank")}
                  sx={getNavButtonSx("/bank")}
                >
                  <WalletIcon sx={navIconSx} />
                </Button>
              </Tooltip>
              <Tooltip title={t("account")}>
                <Button
                  component={Link}
                  to="/account"
                  color="inherit"
                  aria-label={t("account")}
                  sx={getNavButtonSx("/account")}
                >
                  <Badge
                    color="error"
                    variant="dot"
                    invisible={!hasPendingInvitations}
                    overlap="circular"
                    anchorOrigin={{ vertical: "top", horizontal: "right" }}
                  >
                    <ManageAccountsIcon sx={navIconSx} />
                  </Badge>
                </Button>
              </Tooltip>
              <Tooltip title={t("language")}>
                <Button
                  onClick={toggleLanguage}
                  aria-label={t("language")}
                  title={nextLanguage === "en" ? t("english") : t("hebrew")}
                  sx={{ minWidth: 0, px: 1 }}
                >
                  <Box
                    component="img"
                    src={nextLanguageFlagIcon}
                    alt={nextLanguage === "en" ? t("english") : t("hebrew")}
                    sx={{ width: 20, height: 20, display: "block" }}
                  />
                </Button>
              </Tooltip>
              <Tooltip title={t("logout")}>
                <Button
                  color="inherit"
                  onClick={openLogoutModal}
                  aria-label={t("logout")}
                  sx={{ ...mobileNavButtonSx, minWidth: 0 }}
                >
                  <LogoutIcon />
                </Button>
              </Tooltip>
            </Stack>
          ))}
        <Dialog open={isLogoutModalOpen} onClose={closeLogoutModal}>
          <DialogContent>
            <DialogContentText>{t("logoutConfirmMessage")}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeLogoutModal}>{t("cancel")}</Button>
            <Button onClick={confirmLogout} variant="contained" color="primary">
              {t("logout")}
            </Button>
          </DialogActions>
        </Dialog>
      </Toolbar>
      </AppBar>
      {user && isMobile && (
        <>
          <Box
            sx={{
              position: "fixed",
              top: isScrolled ? 0 : mobileHeaderHeight,
              left: 0,
              right: 0,
              zIndex: (theme) => theme.zIndex.appBar + 2,
              px: 2,
              py: 0.75,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 1,
              bgcolor: theme.palette.primary.main,
              transition: "top 180ms ease",
            }}
          >
            <Tooltip title={t("dashboard")}>
              <Button component={Link} to="/" sx={getNavButtonSx("/", true)} aria-label={t("dashboard")}>
                <FormatListBulletedIcon sx={navIconSx} />
              </Button>
            </Tooltip>
            <Tooltip title={t("shoppingLists")}>
              <Button
                component={Link}
                to="/shopping-lists"
                sx={getNavButtonSx("/shopping-lists", true)}
                aria-label={t("shoppingLists")}
              >
                <AddShoppingCartIcon sx={navIconSx} />
              </Button>
            </Tooltip>
            <Tooltip title={t("bank")}>
              <Button component={Link} to="/bank" sx={getNavButtonSx("/bank", true)} aria-label={t("bank")}>
                <WalletIcon sx={navIconSx} />
              </Button>
            </Tooltip>
          </Box>
          <Box sx={{ height: 54 }} />
        </>
      )}
    </>
  );
}
