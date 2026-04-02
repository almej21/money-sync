import { FormControl, InputLabel, Select } from "@mui/material";
import { COLORS } from "../constants/colors";

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
  const baseMenuItemSx = {
    fontSize: "1rem",
    minHeight: "34px",
    py: 0.5,
    color: COLORS.ui.menu.text,
    "&:hover": {
      bgcolor: COLORS.ui.menu.hoverBackground,
    },
    "&.Mui-selected": {
      bgcolor: COLORS.ui.menu.selectedBackground,
      color: COLORS.ui.menu.selectedText,
    },
    "&.Mui-selected:hover": {
      bgcolor: COLORS.ui.menu.selectedBackground,
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
          bgcolor: COLORS.ui.menu.background,
          color: COLORS.ui.menu.text,
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
          { fontSize: "1.1rem" },
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
