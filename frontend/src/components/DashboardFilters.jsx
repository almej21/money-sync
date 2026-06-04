import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import FilterListIcon from "@mui/icons-material/FilterList";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import SortOutlinedIcon from "@mui/icons-material/SortOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import GroupIcon from "@mui/icons-material/Group";
import PersonIcon from "@mui/icons-material/Person";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import {
  Box,
  Checkbox,
  Collapse,
  IconButton,
  ListItemText,
  MenuItem,
  Slider,
  Stack,
  ThemeProvider,
  Typography,
  createTheme,
  useTheme,
} from "@mui/material";
import { useMemo, useState } from "react";
import AppTextField from "./AppTextField";
import Dropdown from "./Dropdown";
import { formatIlsAmount } from "../lib/currency";

const ltrSliderCache = createCache({ key: "mui-slider-ltr" });

export default function DashboardFilters({
  t,
  categoryAllValue,
  categoryReturnsValue,
  selectedCategories,
  allCategoriesSelected,
  selectedReturnsOnly,
  returnsLabel,
  categoryOptions,
  onCategoryFilterChange,
  renderSelectedCategoriesValue,
  shouldShowAccountFilter,
  selectedConnectionIds,
  hasSingleAccountOption,
  accountFilterOptions,
  singleAccountLabel,
  onAccountFilterChange,
  timeRange,
  onTimeRangeChange,
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange,
  lastSixMonthOptions,
  sortBy,
  onSortByChange,
  showSort = true,
  selectedAmountRange,
  minExpenseAmount,
  maxExpenseAmount,
  onAmountRangeChange,
  showSearch = false,
  searchLabel = "Search",
  searchPlaceholder = "",
  searchQuery = "",
  onSearchQueryChange,
  footerContent,
}) {
  const theme = useTheme();
  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const ltrSliderTheme = useMemo(
    () =>
      createTheme({
        ...theme,
        direction: "ltr",
      }),
    [theme],
  );

  const accountDropdownValue = shouldShowAccountFilter
    ? selectedConnectionIds
    : hasSingleAccountOption
      ? [accountFilterOptions[0].id]
      : [];

  function renderSelectedAccountsValue(selected) {
    if (!shouldShowAccountFilter) {
      return singleAccountLabel;
    }

    const values = Array.isArray(selected) ? selected : [];
    if (!values.length || values.length === accountFilterOptions.length) {
      return t("allAccounts");
    }

    return values
      .map(
        (id) =>
          accountFilterOptions.find((option) => option.id === id)?.label || id,
      )
      .join(", ");
  }

  function labelWithIcon(text, Icon) {
    return (
      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
        <Icon sx={{ fontSize: 16 }} />
        <Box component="span">{text}</Box>
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
        <IconButton
          aria-label={t("filter") || "Filters"}
          onClick={() => setIsWindowOpen((prev) => !prev)}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            transition: "transform 220ms ease, background-color 180ms ease",
            transform: isWindowOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <FilterListIcon />
        </IconButton>
      </Box>

      <Collapse in={isWindowOpen} timeout={260}>
        <Box sx={{ mb: 2 }}>
          <Box
            sx={{
              maxHeight: "none",
              background: "transparent",
              borderRadius: 2,
            }}
          >
            <Box
              sx={{
                px: { xs: 2, sm: 3 },
                pt: { xs: 2, sm: 3 },
                width: "100%",
                maxHeight: "none",
                overflowY: "visible",
                overflowX: "hidden",
                boxSizing: "border-box",
              }}
            >
              <Stack direction="column" spacing={2} sx={{ mb: 2 }}>
                  <Dropdown
                    labelId="category-filter-label"
                    label={labelWithIcon(t("categoryFilter"), CategoryOutlinedIcon)}
                    labelShrink
                    multiple
                  value={selectedCategories}
                  displayEmpty
                  onChange={(event) =>
                    onCategoryFilterChange(event.target.value)
                  }
                  renderValue={renderSelectedCategoriesValue}
                  sx={{ width: "100%" }}
                >
                  <MenuItem value={categoryAllValue}>
                    <Checkbox
                      checked={allCategoriesSelected}
                      indeterminate={
                        !allCategoriesSelected && selectedCategories.length > 0
                      }
                    />
                    <ListItemText primary={t("all")} />
                  </MenuItem>
                  <MenuItem value={categoryReturnsValue}>
                    <Checkbox
                      checked={allCategoriesSelected || selectedReturnsOnly}
                    />
                    <ListItemText primary={returnsLabel} />
                  </MenuItem>
                  {categoryOptions.map((category) => (
                    <MenuItem key={category} value={category}>
                      <Checkbox
                        checked={
                          allCategoriesSelected ||
                          selectedCategories.includes(category)
                        }
                      />
                      <ListItemText primary={category} />
                    </MenuItem>
                  ))}
                </Dropdown>

                <Dropdown
                    labelId="time-range-label"
                    value={timeRange}
                    label={labelWithIcon(t("timeRange"), AccessTimeOutlinedIcon)}
                    labelShrink
                    onChange={(event) => onTimeRangeChange(event.target.value)}
                    sx={{ width: "100%" }}
                >
                  <MenuItem value="this_month">{t("thisMonth")}</MenuItem>
                  <MenuItem value="custom_range">{t("customRange")}</MenuItem>
                  <MenuItem value="all_time">{t("allTime")}</MenuItem>
                  {lastSixMonthOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Dropdown>
                {timeRange === "custom_range" && (
                  <Stack
                    direction="row"
                    useFlexGap
                    sx={{ gap: 2 }}
                  >
                    <AppTextField
                      id="custom-start-date"
                      type="date"
                      label={t("startDate")}
                      value={customStartDate}
                      onChange={(event) =>
                        onCustomStartDateChange(event.target.value)
                      }
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                    <AppTextField
                      id="custom-end-date"
                      type="date"
                      label={t("endDate")}
                      value={customEndDate}
                      onChange={(event) =>
                        onCustomEndDateChange(event.target.value)
                      }
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                  </Stack>
                )}

                {showSort && (
                  <Dropdown
                    labelId="sort-by-label"
                    value={sortBy}
                    label={labelWithIcon(t("sortBy"), SortOutlinedIcon)}
                    labelShrink
                    onChange={(event) => onSortByChange(event.target.value)}
                    sx={{ width: "100%" }}
                  >
                    <MenuItem value="date_desc">{t("sortDateNewest")}</MenuItem>
                    <MenuItem value="date_asc">{t("sortDateOldest")}</MenuItem>
                    <MenuItem value="amount_desc">
                      {t("sortPriceHighToLow")}
                    </MenuItem>
                    <MenuItem value="amount_asc">
                      {t("sortPriceLowToHigh")}
                    </MenuItem>
                  </Dropdown>
                )}

                <Dropdown
                    labelId="account-filter-label"
                    label={labelWithIcon(
                      t("accountFilter"),
                      AccountBalanceOutlinedIcon,
                    )}
                    labelShrink
                    inputLabelSx={(theme) => ({
                      "&.MuiInputLabel-outlined:not(.MuiInputLabel-shrink)": {
                        transform:
                          theme.direction === "rtl"
                            ? "translate(-16px, 9px) scale(1) !important"
                            : "translate(0, 9px) scale(1) !important",
                      },
                      "&.MuiInputLabel-outlined.MuiInputLabel-shrink": {
                        transform:
                          theme.direction === "rtl"
                            ? "translate(-16px, -9px) scale(0.75) !important"
                            : "translate(0, -9px) scale(0.75) !important",
                      },
                    })}
                    multiple
                  displayEmpty
                  disabled={!shouldShowAccountFilter}
                  value={accountDropdownValue}
                  onChange={(event) =>
                    onAccountFilterChange(event.target.value)
                  }
                  renderValue={renderSelectedAccountsValue}
                  sx={{ width: "100%" }}
                >
                  {!shouldShowAccountFilter ? (
                    <MenuItem disabled value="">
                      <ListItemText primary={singleAccountLabel} />
                    </MenuItem>
                  ) : (
                    accountFilterOptions.map((option) => (
                      <MenuItem key={option.id} value={option.id}>
                        <Checkbox
                          checked={selectedConnectionIds.includes(option.id)}
                        />
                        <ListItemText
                          primary={
                            <Box
                              sx={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 0.75,
                              }}
                            >
                              {option.visibilityScope === "private" ? (
                                <PersonIcon sx={{ fontSize: 16 }} />
                              ) : (
                                <GroupIcon sx={{ fontSize: 16 }} />
                              )}
                              <Box component="span">{option.label}</Box>
                            </Box>
                          }
                        />
                      </MenuItem>
                    ))
                  )}
                </Dropdown>

                {showSearch && (
                  <AppTextField
                    type="text"
                    fullWidth
                    value={searchQuery}
                    onChange={(event) =>
                      onSearchQueryChange?.(event.target.value)
                    }
                    label={labelWithIcon(searchLabel, SearchOutlinedIcon)}
                    placeholder={searchPlaceholder}
                    InputLabelProps={{ shrink: true }}
                    sx={{
                      "& .MuiInputLabel-root": {
                        fontSize: "1.1rem",
                        lineHeight: 1,
                      },
                      "& .MuiInputLabel-root .MuiBox-root": {
                        display: "inline-flex",
                        alignItems: "center",
                      },
                      "& .MuiOutlinedInput-root": {
                        minHeight: "45px",
                      },
                      "& .MuiOutlinedInput-input": {
                        fontSize: ".9rem",
                        minHeight: "20px",
                        display: "flex",
                        alignItems: "center",
                        paddingTop: "7px",
                        paddingBottom: "7px",
                      },
                    }}
                  />
                )}
              </Stack>

              <Box
                sx={{
                  mb: 1,
                  px: { xs: 0, sm: 1 },
                  width: { xs: "100%", md: "80%" },
                  mx: "auto",
                }}
              >
                  <Typography
                    variant="body2"
                    color="text.primary"
                    sx={{
                      mb: 1,
                      textAlign: "center",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 0.75,
                    }}
                  >
                    <TuneOutlinedIcon sx={{ fontSize: 16 }} />
                    {t("amountRange")}:{" "}
                  <Box
                    component="span"
                    dir="ltr"
                    sx={{ unicodeBidi: "isolate" }}
                  >
                    {formatIlsAmount(Math.round(selectedAmountRange[0]))} -{" "}
                    {formatIlsAmount(Math.round(selectedAmountRange[1]))}
                  </Box>
                </Typography>
                <CacheProvider value={ltrSliderCache}>
                  <Box dir="ltr" sx={{ px: { xs: 2.25, sm: 2.5 } }}>
                    <ThemeProvider theme={ltrSliderTheme}>
                      <Slider
                        value={selectedAmountRange}
                        min={minExpenseAmount}
                        max={maxExpenseAmount}
                        step={1}
                        disableSwap
                        onChange={(_, newValue) => {
                          const nextRange = Array.isArray(newValue)
                            ? newValue
                            : [minExpenseAmount, maxExpenseAmount];
                          onAmountRangeChange(nextRange);
                        }}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(value) =>
                          formatIlsAmount(Math.round(Number(value)))
                        }
                        sx={{ direction: "ltr", width: "100%" }}
                      />
                    </ThemeProvider>
                  </Box>
                </CacheProvider>
              </Box>
              {footerContent ? (
                <Box
                  sx={{
                    mt: 1.5,
                    px: { xs: 0.5, sm: 1 },
                    width: { xs: "100%", md: "80%" },
                    mx: "auto",
                  }}
                >
                  {footerContent}
                </Box>
              ) : null}
            </Box>
          </Box>
        </Box>
      </Collapse>
    </>
  );
}
