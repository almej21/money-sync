import { Link } from "react-router-dom";
import {
  AppBar,
  Button,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { useAuth } from "../context/AuthContext";

export default function NavBar() {
  const { user, logout } = useAuth();

  return (
    <AppBar position="sticky" color="inherit" elevation={1}>
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
          Money Sync
        </Typography>
        {user && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Button component={Link} to="/" color="inherit">
              Dashboard
            </Button>
            <Button component={Link} to="/expenses" color="inherit">
              Expenses
            </Button>
            <Button component={Link} to="/shopping-lists" color="inherit">
              Shopping Lists
            </Button>
            <Button variant="contained" color="primary" onClick={logout}>
              Logout
            </Button>
          </Stack>
        )}
      </Toolbar>
    </AppBar>
  );
}
