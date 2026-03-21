import { Link } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
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
      <polygon points="20,9 14,19 26,19" fill="none" stroke="#0038b8" strokeWidth="1.6" />
      <polygon points="20,19 14,9 26,9" fill="none" stroke="#0038b8" strokeWidth="1.6" />
    </Box>
  );
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  return (
    <AppBar position="sticky" color="inherit" elevation={1}>
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
          {t("appTitle")}
        </Typography>
        {user && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Button component={Link} to="/" color="inherit">
              {t("dashboard")}
            </Button>
            <Button component={Link} to="/expenses" color="inherit">
              {t("expenses")}
            </Button>
            <Button component={Link} to="/shopping-lists" color="inherit">
              {t("shoppingLists")}
            </Button>
            <Button component={Link} to="/bank" color="inherit">
              {t("bank")}
            </Button>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <Select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                displayEmpty
                inputProps={{ "aria-label": t("language") }}
              >
                <MenuItem value="en">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <UsaFlag />
                    <span>{t("english")}</span>
                  </Stack>
                </MenuItem>
                <MenuItem value="he">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <IsraelFlag />
                    <span>{t("hebrew")}</span>
                  </Stack>
                </MenuItem>
              </Select>
            </FormControl>
            <Button variant="contained" color="primary" onClick={logout}>
              {t("logout")}
            </Button>
          </Stack>
        )}
      </Toolbar>
    </AppBar>
  );
}
