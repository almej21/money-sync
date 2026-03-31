import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import LogoutIcon from "@mui/icons-material/Logout";
import WalletIcon from "@mui/icons-material/Wallet";
import {
  AppBar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import israelFlagIcon from "../assets/icons/israel.png";
import usaFlagIcon from "../assets/icons/united-states.png";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

export default function NavBar() {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileHeaderHeight, setMobileHeaderHeight] = useState(0);
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
      bgcolor: "rgba(47, 58, 36, .2)",
    },
  };

  const NavButtonSx = {
    "&:hover": {
      bgcolor: "rgba(47, 58, 36, .2)",
    },
  };

  const navIconSx = { fontSize: 26 };

  return (
    <>
      <AppBar ref={appBarRef} position="static" color="inherit" elevation={1}>
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
        {user &&
          (isMobile ? (
            <Stack direction="row" spacing={1} alignItems="center">
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
              <Button
                color="inherit"
                onClick={openLogoutModal}
                aria-label={t("logout")}
                sx={{ ...mobileNavButtonSx, minWidth: 0 }}
              >
                <LogoutIcon />
              </Button>
            </Stack>
          ) : (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ flexWrap: "wrap" }}
            >
              <Button
                component={Link}
                to="/"
                color="inherit"
                aria-label={t("dashboard")}
                sx={NavButtonSx}
              >
                <FormatListBulletedIcon sx={navIconSx} />
              </Button>
              <Button
                component={Link}
                to="/shopping-lists"
                color="inherit"
                aria-label={t("shoppingLists")}
                sx={NavButtonSx}
              >
                <AddShoppingCartIcon sx={navIconSx} />
              </Button>
              <Button
                component={Link}
                to="/bank"
                color="inherit"
                aria-label={t("bank")}
                sx={NavButtonSx}
              >
                <WalletIcon sx={navIconSx} />
              </Button>
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
              <Button
                color="inherit"
                onClick={openLogoutModal}
                aria-label={t("logout")}
                sx={{ ...mobileNavButtonSx, minWidth: 0 }}
              >
                <LogoutIcon />
              </Button>
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
              bgcolor: "#718355",
              borderBottom: "1px solid #87986a",
              transition: "top 180ms ease",
            }}
          >
            <Button component={Link} to="/" sx={mobileNavButtonSx} aria-label={t("dashboard")}>
              <FormatListBulletedIcon sx={navIconSx} />
            </Button>
            <Button
              component={Link}
              to="/shopping-lists"
              sx={mobileNavButtonSx}
              aria-label={t("shoppingLists")}
            >
              <AddShoppingCartIcon sx={navIconSx} />
            </Button>
            <Button component={Link} to="/bank" sx={mobileNavButtonSx} aria-label={t("bank")}>
              <WalletIcon sx={navIconSx} />
            </Button>
          </Box>
          <Box sx={{ height: 54 }} />
        </>
      )}
    </>
  );
}
