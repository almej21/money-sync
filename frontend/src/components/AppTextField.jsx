import { useMemo } from "react";
import TextField from "@mui/material/TextField";
import { useTheme } from "@mui/material/styles";
import { useLanguage } from "../context/LanguageContext";

export default function AppTextField(props) {
  const { sx, ...rest } = props;
  const theme = useTheme();
  const { direction } = useLanguage();
  const isRtl = direction === "rtl" || theme.direction === "rtl";

  const mergedSx = useMemo(() => {
    const sxArray = Array.isArray(sx) ? sx : [sx];
    return [
      {
        "& .MuiInputLabel-root": {
          textAlign: isRtl ? "right" : "left",
        },
        "& .MuiInputLabel-root.MuiInputLabel-outlined": {
          insetInlineStart: "14px !important",
          insetInlineEnd: "auto !important",
          left: "auto !important",
          right: "auto !important",
          transformOrigin: isRtl
            ? "top right !important"
            : "top left !important",
        },
        "& .MuiInputLabel-root.MuiInputLabel-outlined:not(.MuiInputLabel-shrink)":
          {
            transform: isRtl
              ? "translate(-14px, 9px) scale(1) !important"
              : "translate(0, 9px) scale(1) !important",
          },
        "& .MuiInputLabel-root.MuiInputLabel-outlined.MuiInputLabel-shrink": {
          transform: isRtl
            ? "translate(-8px, -9px) scale(0.75) !important"
            : "translate(10px, -9px) scale(0.75) !important",
        },
      },
      ...sxArray.filter(Boolean),
    ];
  }, [isRtl, sx]);

  return <TextField {...rest} sx={mergedSx} />;
}
