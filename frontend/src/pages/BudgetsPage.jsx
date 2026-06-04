import { Card, CardContent, Typography } from "@mui/material";
import { useLanguage } from "../context/LanguageContext";

export default function BudgetsPage() {
  const { direction, t } = useLanguage();

  return (
    <Card dir={direction}>
      <CardContent>
        <Typography
          variant="h5"
          sx={{
            fontFamily: "inherit",
            fontWeight: direction === "rtl" ? 400 : 800,
            mb: 1,
          }}
        >
          {t("budgets")}
        </Typography>
        <Typography color="text.secondary">{t("budgetsComingSoon")}</Typography>
      </CardContent>
    </Card>
  );
}
