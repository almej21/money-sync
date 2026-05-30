import {
  alpha,
  FormControl,
  InputLabel,
  Select,
  useTheme,
} from "@mui/material";
import { useLanguage } from "../context/LanguageContext";

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
  const { direction } = useLanguage();
  const isRtl = direction === "rtl";
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
    sx: [
      {
        zIndex: (theme) => theme.zIndex.modal + 5,
      },
      ...toSxArray(incomingMenuProps?.sx),
    ],
    ...incomingMenuProps,
    PaperProps: {
      ...(incomingMenuProps?.PaperProps || {}),
      sx: [
        {
          maxHeight: "min(420px, calc(100vh - 120px))",
          bgcolor: theme.palette.primary.dark,
          color: theme.palette.primary.contrastText,
          "& .MuiMenuItem-root": [baseMenuItemSx, ...toSxArray(menuItemSx)],
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
            textAlign: isRtl ? "right" : "left",
            lineHeight: 1,
            "&.MuiInputLabel-outlined": {
              insetInlineStart: isRtl ? "0px !important" : "14px !important",
              insetInlineEnd: "auto !important",
              left: "auto !important",
              right: "auto !important",
              transformOrigin: isRtl
                ? "top right !important"
                : "top left !important",
            },
            "&.MuiInputLabel-outlined:not(.MuiInputLabel-shrink)": {
              transform: isRtl
                ? "translate(-14px, 9px) scale(1) !important"
                : "translate(0, 9px) scale(1) !important",
            },
            "&.MuiInputLabel-outlined.MuiInputLabel-shrink": {
              transform: isRtl
                ? "translate(-8px, -9px) scale(0.75) !important"
                : "translate(12px, -9px) scale(0.75) !important",
            },
          },
          ...toSxArray(inputLabelSx),
        ]}
      >
        {label}
      </InputLabel>
      <Select
        labelId={labelId}
        label={label}
        notched={Boolean(labelShrink)}
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
            "& .MuiSelect-select, & .MuiSelect-select.MuiSelect-outlined": {
              fontSize: ".9rem",
              minHeight: "20px",
              display: "flex !important",
              width: "100%",
              alignItems: "center",
              justifyContent: isRtl ? "flex-end" : "flex-start",
              textAlign: isRtl ? "right !important" : "left !important",
              direction: isRtl ? "rtl !important" : "ltr !important",
              paddingTop: "7px",
              paddingBottom: "7px",
              paddingInlineStart: isRtl ? "36px" : "14px",
              paddingInlineEnd: isRtl ? "14px" : "36px",
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
