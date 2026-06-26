import TextField from "@mui/material/TextField";
import { useTheme } from "@mui/material/styles";
import { useMemo } from "react";
import { useLanguage } from "../context/LanguageContext";

export default function AppTextField(props) {
  const { inputHeight, sx, ...rest } = props;
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
        ...(inputHeight
          ? {
              "& .MuiOutlinedInput-root": {
                minHeight: inputHeight,
              },
              "& .MuiInputBase-input": {
                boxSizing: "border-box",
                height: inputHeight,
              },
              "& .MuiSelect-select": {
                minHeight: "0 !important",
                height: `${inputHeight} !important`,
                display: "flex",
                alignItems: "center",
              },
            }
          : {}),
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
              ? "translate(10px, 9px) scale(1) !important"
              : "translate(10px, 10px) scale(1) !important",
          },
        "& .MuiInputLabel-root.MuiInputLabel-outlined.MuiInputLabel-shrink": {
          transform: isRtl
            ? "translate(2px, -9px) scale(0.75) !important"
            : "translate(14px, -9px) scale(0.75) !important",
        },
      },
      ...sxArray.filter(Boolean),
    ];
  }, [inputHeight, isRtl, sx]);

  return <TextField {...rest} sx={mergedSx} />;
}
