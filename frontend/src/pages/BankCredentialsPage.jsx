import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../api";

const INITIAL_FORM = {
  companyId: "visaCal",
  username: "",
  nationalID: "",
  password: "",
};

function requiresNationalId(companyId) {
  return companyId === "yahav";
}

export default function BankCredentialsPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [connected, setConnected] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadStatus() {
    setLoading(true);
    setError("");
    try {
      const data = await api("/bank/credentials");
      setConnected(Boolean(data.connected));
      setUpdatedAt(data.updatedAt || null);
      setForm((prev) => ({ ...prev, companyId: data.companyId || "visaCal" }));
    } catch (err) {
      setError(err.message || "Failed to load bank connection status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function saveCredentials(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api("/bank/credentials", {
        method: "PUT",
        body: JSON.stringify({
          companyId: form.companyId.trim(),
          username: form.username.trim(),
          nationalID: form.nationalID.trim(),
          password: form.password,
        }),
      });
      setSuccess("Bank credentials saved.");
      setForm((prev) => ({ ...prev, password: "" }));
      await loadStatus();
    } catch (err) {
      setError(err.message || "Failed to save bank credentials");
    } finally {
      setSaving(false);
    }
  }

  async function disconnectBank() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api("/bank/credentials", { method: "DELETE" });
      setConnected(false);
      setUpdatedAt(null);
      setForm(INITIAL_FORM);
      setSuccess("Bank credentials removed.");
    } catch (err) {
      setError(err.message || "Failed to remove bank credentials");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Bank credentials
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Configure credentials used by bank sync for your account.
          </Typography>

          <Stack spacing={1} sx={{ mb: 2 }}>
            <Typography>
              Status: {loading ? "Loading..." : connected ? "Connected" : "Not connected"}
            </Typography>
            {!loading && updatedAt && (
              <Typography color="text.secondary">
                Last updated: {new Date(updatedAt).toLocaleString()}
              </Typography>
            )}
          </Stack>

          <Box component="form" onSubmit={saveCredentials}>
            <Stack spacing={2}>
              <TextField
                label="Company ID"
                select
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                required
                fullWidth
              >
                <MenuItem value="visaCal">visaCal</MenuItem>
                <MenuItem value="yahav">yahav</MenuItem>
              </TextField>
              <TextField
                label="Username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                fullWidth
              />
              <TextField
                label="National ID"
                value={form.nationalID}
                onChange={(e) => setForm({ ...form, nationalID: e.target.value })}
                required={requiresNationalId(form.companyId)}
                helperText={
                  requiresNationalId(form.companyId)
                    ? "Required for yahav"
                    : "Not required for visaCal"
                }
                fullWidth
              />
              <TextField
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                fullWidth
              />
              <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={saving || loading}>
                  Save credentials
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  color="error"
                  onClick={disconnectBank}
                  disabled={saving || loading || !connected}
                >
                  Disconnect
                </Button>
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
    </Stack>
  );
}
