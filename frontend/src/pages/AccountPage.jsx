import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import AppSnackbar from "../components/AppSnackbar";
import { COLOR_SCHEMES } from "../constants/colors";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useAppTheme } from "../context/ThemeContext";
import {
  getBankCredentialStatus,
  getBankProviders,
} from "../services/bankService";
import { getExpenses } from "../services/expenseService";
import {
  acceptHouseholdInvitation,
  getHouseholdOverview,
  getMyHouseholdInvitations,
  sendHouseholdInvitation,
} from "../services/householdService";

export default function AccountPage() {
  const { user, updatePreferences, refreshUser } = useAuth();
  const { t } = useLanguage();
  const { schemeKey, schemeKeys, setSchemeKey } = useAppTheme();
  const [sourceAccountOptions, setSourceAccountOptions] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [joiningInvitationId, setJoiningInvitationId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const shadeKeys = ["primary", "secondary", "accent", "background", "text", "white"];

  const userDefaultIds = useMemo(
    () =>
      Array.isArray(user?.defaultSelectedBankConnectionIds)
        ? user.defaultSelectedBankConnectionIds
        : [],
    [user?.defaultSelectedBankConnectionIds],
  );

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const [
          expenses,
          statusData,
          providersData,
          householdData,
          myInvitesData,
        ] = await Promise.all([
          getExpenses(),
          getBankCredentialStatus(),
          getBankProviders(),
          getHouseholdOverview(),
          getMyHouseholdInvitations(),
        ]);
        const connections = Array.isArray(statusData?.connections)
          ? statusData.connections.filter((connection) =>
              String(connection?.id || "").trim(),
            )
          : [];
        const connectionById = new Map(
          connections.map((connection) => [
            String(connection.id || "").trim(),
            connection,
          ]),
        );

        const providers = Array.isArray(providersData?.providers)
          ? providersData.providers
          : [];
        const providerLabels = Object.fromEntries(
          providers.map((provider) => [
            provider.companyId,
            provider.label || provider.companyId,
          ]),
        );

        const optionsByAccountId = new Map();
        (Array.isArray(expenses) ? expenses : []).forEach((expense) => {
          const accountId = String(expense?.sourceAccountId || "").trim();
          if (!accountId || optionsByAccountId.has(accountId)) return;

          const sourceConnectionKey = String(
            expense?.sourceConnectionKey || "",
          ).trim();
          const sourceCompanyId = String(expense?.sourceCompanyId || "").trim();
          const connection = connectionById.get(sourceConnectionKey);
          const companyId = String(
            connection?.companyId || sourceCompanyId || "",
          ).trim();
          const providerLabel =
            providerLabels[companyId] || companyId || t("bank");

          optionsByAccountId.set(accountId, {
            id: accountId,
            label: `${providerLabel} (${accountId})`,
          });
        });

        const options = Array.from(optionsByAccountId.values()).sort((a, b) =>
          a.label.localeCompare(b.label, "en"),
        );
        setSourceAccountOptions(options);
        setHouseholdMembers(
          Array.isArray(householdData?.members) ? householdData.members : [],
        );
        setPendingInvitations(
          Array.isArray(myInvitesData?.invitations)
            ? myInvitesData.invitations
            : [],
        );
      } catch (err) {
        setError(err.message || t("failedLoadAccountDefaults"));
      } finally {
        setLoading(false);
      }
    }

    loadData().catch(console.error);
  }, [t]);

  useEffect(() => {
    const allConnectionIds = sourceAccountOptions.map((option) => option.id);
    const validDefaultIds = userDefaultIds.filter((id) =>
      allConnectionIds.includes(id),
    );
    setSelectedIds(validDefaultIds.length ? validDefaultIds : allConnectionIds);
  }, [sourceAccountOptions, userDefaultIds]);

  function onToggleConnection(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  }

  async function save() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updatePreferences({
        defaultSelectedBankConnectionIds: selectedIds,
      });
      setSuccess(t("accountDefaultsSaved"));
    } catch (err) {
      setError(err.message || t("failedSaveAccountDefaults"));
    } finally {
      setSaving(false);
    }
  }

  async function inviteUser() {
    const email = String(inviteEmail || "").trim();
    if (!email) {
      setError(t("inviteEmailRequired"));
      return;
    }

    setInviting(true);
    setError("");
    setSuccess("");
    try {
      await sendHouseholdInvitation(email);
      setInviteEmail("");
      setSuccess(t("householdInviteSent"));
      const householdData = await getHouseholdOverview();
      setHouseholdMembers(
        Array.isArray(householdData?.members) ? householdData.members : [],
      );
    } catch (err) {
      setError(err.message || t("failedInviteUser"));
    } finally {
      setInviting(false);
    }
  }

  async function acceptInvite(invitationId) {
    const id = String(invitationId || "").trim();
    if (!id) return;
    setJoiningInvitationId(id);
    setError("");
    setSuccess("");

    try {
      await acceptHouseholdInvitation(id);
      await refreshUser();
      setSuccess(t("householdJoined"));
      await Promise.all([
        getMyHouseholdInvitations().then((data) =>
          setPendingInvitations(
            Array.isArray(data?.invitations) ? data.invitations : [],
          ),
        ),
        getHouseholdOverview().then((householdData) =>
          setHouseholdMembers(
            Array.isArray(householdData?.members) ? householdData.members : [],
          ),
        ),
      ]);
    } catch (err) {
      setError(err.message || t("failedJoinHousehold"));
    } finally {
      setJoiningInvitationId("");
    }
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            {t("account")}
          </Typography>
          <Stack spacing={1.5}>
            <Accordion
              defaultExpanded={false}
              sx={{ backgroundColor: "background.default" }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1">{t("myUserInfo")}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={0.75}>
                  <Typography>
                    <strong>{t("name")}:</strong> {user?.name || "-"}
                  </Typography>
                  <Typography>
                    <strong>{t("email")}:</strong> {user?.email || "-"}
                  </Typography>
                  <Typography>
                    <strong>{t("role")}:</strong>{" "}
                    {t(
                      (user?.role || "manager") === "manager"
                        ? "managerRole"
                        : "memberRole",
                    )}
                  </Typography>
                </Stack>
              </AccordionDetails>
            </Accordion>

            <Accordion
              defaultExpanded={false}
              sx={{ backgroundColor: "background.default" }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1">{t("theme")}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  {t("themeSectionDescription")}
                </Typography>
                <TextField
                  select
                  fullWidth
                  label={t("colorScheme")}
                  value={schemeKey}
                  onChange={(event) => setSchemeKey(event.target.value)}
                >
                  {schemeKeys.map((key) => {
                    const scheme = COLOR_SCHEMES[key];
                    const displayName = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
                    return (
                    <MenuItem key={key} value={key}>
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        width="100%"
                        spacing={1}
                      >
                        <Typography variant="body2">{displayName}</Typography>
                        <Stack direction="row" spacing={0.5}>
                          {shadeKeys.map((shadeKey) => (
                            <Box
                              key={`${key}-${shadeKey}`}
                              sx={{
                                width: 14,
                                height: 14,
                                borderRadius: 0.5,
                                bgcolor: scheme?.[shadeKey] || "transparent",
                                border: "1px solid",
                                borderColor:
                                  shadeKey === "white"
                                    ? "divider"
                                    : "transparent",
                              }}
                            />
                          ))}
                        </Stack>
                      </Stack>
                    </MenuItem>
                    );
                  })}
                </TextField>
              </AccordionDetails>
            </Accordion>

            <Accordion
              defaultExpanded={false}
              sx={{ backgroundColor: "background.default" }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1">
                  {t("defaultBankAccountsSectionTitle")}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  {t("defaultBankAccountsDescription")}
                </Typography>

                {loading ? (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      py: 1,
                    }}
                  >
                    <CircularProgress size={20} />
                  </Box>
                ) : !sourceAccountOptions.length ? (
                  <Typography color="text.secondary">
                    {t("noBankConnections")}
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {sourceAccountOptions.map((option) => {
                      return (
                        <FormControlLabel
                          key={option.id}
                          control={
                            <Checkbox
                              checked={selectedIds.includes(option.id)}
                              onChange={() => onToggleConnection(option.id)}
                            />
                          }
                          label={option.label}
                        />
                      );
                    })}
                  </Stack>
                )}

                <Button
                  variant="contained"
                  sx={{ mt: 2 }}
                  onClick={save}
                  disabled={saving || loading || !sourceAccountOptions.length}
                >
                  {t("save")}
                </Button>
              </AccordionDetails>
            </Accordion>

            <Accordion
              defaultExpanded={false}
              sx={{ backgroundColor: "background.default" }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1">
                  {t("householdMembers")}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                {loading ? (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      py: 1,
                    }}
                  >
                    <CircularProgress size={20} />
                  </Box>
                ) : !householdMembers.length ? (
                  <Typography color="text.secondary">-</Typography>
                ) : (
                  <Stack spacing={0.5}>
                    {householdMembers.map((member) => (
                      <Typography key={member.id}>
                        {member.name} ({member.email}) -{" "}
                        {t(
                          member.role === "manager"
                            ? "managerRole"
                            : "memberRole",
                        )}
                      </Typography>
                    ))}
                  </Stack>
                )}

                {(user?.role || "manager") === "manager" && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle1" gutterBottom>
                      {t("inviteToHousehold")}
                    </Typography>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      useFlexGap
                      sx={{ gap: 1 }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <TextField
                          label={t("email")}
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          fullWidth
                        />
                      </Box>
                      <Button
                        variant="contained"
                        onClick={inviteUser}
                        disabled={inviting}
                        sx={{ whiteSpace: "nowrap", minWidth: 120 }}
                      >
                        {t("sendInvite")}
                      </Button>
                    </Stack>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 1 }}
                    >
                      {t("inviteHint")}
                    </Typography>
                  </>
                )}
              </AccordionDetails>
            </Accordion>

            <Accordion
              defaultExpanded={false}
              sx={{ backgroundColor: "background.default" }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle1">
                    {t("householdInvitations")}
                  </Typography>
                  {pendingInvitations.length > 0 && (
                    <WarningAmberRoundedIcon color="warning" fontSize="small" />
                  )}
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                {!pendingInvitations.length ? (
                  <Typography color="text.secondary">
                    {t("noPendingInvitations")}
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {pendingInvitations.map((invitation) => (
                      <Stack
                        key={invitation.id}
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        alignItems={{ sm: "center" }}
                        justifyContent="space-between"
                      >
                        <Typography>
                          {t("inviteFrom")} {invitation?.inviter?.email || "-"}
                        </Typography>
                        <Button
                          variant="outlined"
                          onClick={() => acceptInvite(invitation.id)}
                          disabled={joiningInvitationId === invitation.id}
                        >
                          {t("joinHousehold")}
                        </Button>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </AccordionDetails>
            </Accordion>
          </Stack>
        </CardContent>
      </Card>

      <AppSnackbar
        open={Boolean(error)}
        message={error}
        severity="error"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        onClose={() => setError("")}
      />
      <AppSnackbar
        open={Boolean(success)}
        message={success}
        severity="success"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        onClose={() => setSuccess("")}
      />
    </Stack>
  );
}
