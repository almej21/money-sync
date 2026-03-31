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
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

function UsaFlag() {
  return (
    <Box
      aria-hidden
      sx={{
        width: 20,
        height: 14,
        border: "1px solid rgba(0,0,0,0.2)",
        borderRadius: "2px",
        background:
          "linear-gradient(to bottom, #b22234 0%, #b22234 14.2%, #fff 14.2%, #fff 28.4%, #b22234 28.4%, #b22234 42.6%, #fff 42.6%, #fff 56.8%, #b22234 56.8%, #b22234 71%, #fff 71%, #fff 85.2%, #b22234 85.2%, #b22234 100%)",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "45%",
          height: "54%",
          bgcolor: "#3c3b6e",
        }}
      />
    </Box>
  );
}

function IsraelFlag() {
  return (
    <Box
      aria-hidden
      component="svg"
      viewBox="0 0 40 28"
      xmlns="http://www.w3.org/2000/svg"
      sx={{
        width: 20,
        height: 14,
        border: "1px solid rgba(0,0,0,0.2)",
        borderRadius: "2px",
        overflow: "hidden",
        flexShrink: 0,
        display: "block",
        bgcolor: "#fff",
      }}
    >
      <rect x="0" y="0" width="40" height="28" fill="#ffffff" />
      <rect x="0" y="3" width="40" height="4" fill="#0038b8" />
      <rect x="0" y="21" width="40" height="4" fill="#0038b8" />
      <polygon
        points="20,9 14,19 26,19"
        fill="none"
        stroke="#0038b8"
        strokeWidth="1.6"
      />
      <polygon
        points="20,19 14,9 26,9"
        fill="none"
        stroke="#0038b8"
        strokeWidth="1.6"
      />
    </Box>
  );
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const nextLanguage = language === "en" ? "he" : "en";
  const toggleLanguage = () => setLanguage(nextLanguage);
  const NextLanguageFlag = nextLanguage === "en" ? UsaFlag : IsraelFlag;
  const openLogoutModal = () => setIsLogoutModalOpen(true);
  const closeLogoutModal = () => setIsLogoutModalOpen(false);
  const confirmLogout = () => {
    setIsLogoutModalOpen(false);
    logout();
  };

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
    <AppBar position="sticky" color="inherit" elevation={1}>
      <Toolbar
        sx={{
          py: isMobile ? 1 : 0.5,
          px: { xs: 2, sm: 3 },
          display: isMobile ? "block" : "flex",
        }}
      >
        <Typography
          variant={isMobile ? "subtitle1" : "h6"}
          sx={{
            flexGrow: 1,
            fontWeight: 700,
            minWidth: 0,
            pr: 1,
            mb: isMobile ? 1 : 0,
          }}
        >
          {t("appTitle")}
        </Typography>
        {user &&
          (isMobile ? (
            <Stack spacing={1.25} sx={{ width: "100%" }}>
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  onClick={toggleLanguage}
                  aria-label={t("language")}
                  title={nextLanguage === "en" ? t("english") : t("hebrew")}
                  sx={{
                    minWidth: 0,
                    px: 1,
                    py: 0.6,
                    borderRadius: 2,
                    bgcolor: "rgba(255, 255, 255, 0.12)",
                  }}
                >
                  <NextLanguageFlag />
                </Button>
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 1,
                }}
              >
                <Button
                  component={Link}
                  to="/"
                  sx={mobileNavButtonSx}
                  aria-label={t("dashboard")}
                >
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
                <Button
                  component={Link}
                  to="/bank"
                  sx={mobileNavButtonSx}
                  aria-label={t("bank")}
                >
                  <WalletIcon sx={navIconSx} />
                </Button>
              </Box>

              <Button
                variant="text"
                onClick={openLogoutModal}
                aria-label={t("logout")}
                fullWidth
                sx={mobileNavButtonSx}
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
                <NextLanguageFlag />
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
  );
}
