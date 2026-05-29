import { Box, Button, Collapse, MenuItem, Stack, Typography } from "@mui/material";
import AppTextField from "../AppTextField";
import Dropdown from "../Dropdown";

export default function AddConnectionForm({
  t,
  isExpanded,
  onToggle,
  canManageBankConnections,
  form,
  providers,
  selectedProvider,
  saving,
  loading,
  connectedCount,
  onSubmit,
  onCompanyChange,
  onConnectionNameChange,
  onVisibilityChange,
  onCredentialFieldChange,
  onRemoveAll,
}) {
  return (
    <Stack spacing={2}>
      {!canManageBankConnections && (
        <Typography color="warning.main">{t("bankManagerOnlyMessage")}</Typography>
      )}
      <Button
        type="button"
        variant="outlined"
        onClick={onToggle}
        disabled={!canManageBankConnections}
        sx={{
          width: { xs: "100%", sm: "auto" },
          alignSelf: "flex-start",
        }}
      >
        {isExpanded ? `${t("addConnection")} -` : `${t("addConnection")} +`}
      </Button>
      <Collapse in={isExpanded}>
        <Box component="form" onSubmit={onSubmit}>
          <Stack spacing={2}>
            <Typography variant="subtitle1">{t("addConnection")}</Typography>
            <Dropdown
              labelId="bank-provider-label"
              label={t("bankOrCreditCardCompany")}
              value={form.companyId}
              onChange={(e) => onCompanyChange(e.target.value)}
              required
            >
              {providers.map((provider) => (
                <MenuItem key={provider.companyId} value={provider.companyId}>
                  {provider.label} ({provider.companyId})
                </MenuItem>
              ))}
            </Dropdown>

            <AppTextField
              label={t("connectionName")}
              value={form.connectionName}
              onChange={(e) => onConnectionNameChange(e.target.value)}
              helperText={t("optional")}
              fullWidth
            />
            <Dropdown
              labelId="bank-connection-visibility-label"
              label={t("connectionVisibility")}
              value={form.visibilityScope}
              onChange={(e) => onVisibilityChange(e.target.value)}
              required
            >
              <MenuItem value="shared">{t("sharedConnection")}</MenuItem>
              <MenuItem value="private">{t("privateConnection")}</MenuItem>
            </Dropdown>

            {(selectedProvider?.fields || []).map((field) => (
              <AppTextField
                key={field.name}
                label={field.label || field.name}
                type={field.type || "text"}
                value={form.credentials[field.name] || ""}
                onChange={(e) => onCredentialFieldChange(field.name, e.target.value)}
                required={Boolean(field.required)}
                helperText={field.required ? t("required") : t("optional")}
                fullWidth
              />
            ))}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                type="submit"
                variant="contained"
                disabled={saving || loading || !canManageBankConnections}
                sx={{ width: { xs: "100%", sm: "auto" } }}
              >
                {t("addConnection")}
              </Button>
              <Button
                type="button"
                variant="outlined"
                color="error"
                onClick={onRemoveAll}
                disabled={
                  saving || loading || connectedCount === 0 || !canManageBankConnections
                }
                sx={{ width: { xs: "100%", sm: "auto" }}
              }
              >
                {t("removeAllConnections")}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Collapse>
    </Stack>
  );
}
