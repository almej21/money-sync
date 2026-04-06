import { alpha, FormControl, InputLabel, Select, useTheme } from "@mui/material";

function toSxArray(sx) {
  if (!sx) return [];
  return Array.isArray(sx) ? sx : [sx];
}

export default function Dropdown({
  label,
  labelId,
  labelShrink,
  sx,
  inputLabelSx,
  selectSx,
  menuPaperSx,
  menuItemSx,
  MenuProps: incomingMenuProps,
  children,
  ...selectProps
}) {
  const theme = useTheme();
  const baseMenuItemSx = {
    fontSize: "1rem",
    minHeight: "34px",
    py: 0.5,
    color: theme.palette.primary.contrastText,
    "&:hover": {
      bgcolor: alpha(theme.palette.primary.contrastText, 0.1),
    },
    "&.Mui-selected": {
      bgcolor: alpha(theme.palette.primary.contrastText, 0.14),
      color: theme.palette.primary.contrastText,
    },
    "&.Mui-selected:hover": {
      bgcolor: alpha(theme.palette.primary.contrastText, 0.14),
    },
  };

  const mergedMenuProps = {
    disableScrollLock: true,
    // Keep the menu anchored to the select input instead of drifting toward
    // viewport edges when the option list is long (especially on mobile).
    anchorOrigin: { vertical: "bottom", horizontal: "left" },
    transformOrigin: { vertical: "top", horizontal: "left" },
    anchorReference: "anchorEl",
    ...incomingMenuProps,
    PaperProps: {
      ...(incomingMenuProps?.PaperProps || {}),
      sx: [
        {
          maxHeight: "min(420px, calc(100vh - 120px))",
          bgcolor: theme.palette.primary.dark,
          color: theme.palette.primary.contrastText,
          "& .MuiMenuItem-root": [
            baseMenuItemSx,
            ...toSxArray(menuItemSx),
          ],
        },
        ...toSxArray(incomingMenuProps?.PaperProps?.sx),
        ...toSxArray(menuPaperSx),
      ],
    },
  };

  return (
    <FormControl fullWidth sx={sx}>
      <InputLabel
        id={labelId}
        shrink={labelShrink}
        sx={[
          {
            fontSize: "1.1rem",
            transform: "translate(10px, -17px) scale(0.75)",
          },
          ...toSxArray(inputLabelSx),
        ]}
      >
        {label}
      </InputLabel>
      <Select
        labelId={labelId}
        label={label}
        MenuProps={mergedMenuProps}
        sx={[
          {
            minHeight: "45px",
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: "divider",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "text.secondary",
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: "primary.main",
              borderWidth: 2,
            },
            "& .MuiSelect-select": {
              fontSize: ".9rem",
              minHeight: "20px",
              display: "flex",
              alignItems: "center",
              paddingTop: "7px",
              paddingBottom: "7px",
            },
          },
          ...toSxArray(selectSx),
        ]}
        {...selectProps}
      >
        {children}
      </Select>
    </FormControl>
  );
}
