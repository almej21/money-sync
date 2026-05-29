import { useMemo } from "react";
import TextField from "@mui/material/TextField";
import { useTheme } from "@mui/material/styles";

export default function AppTextField(props) {
  const { sx, ...rest } = props;
  const theme = useTheme();
  const isRtl = theme.direction === "rtl";
  const restingLabelX = isRtl ? "-14px" : "14px";

  const mergedSx = useMemo(() => {
    const sxArray = Array.isArray(sx) ? sx : [sx];
    return [
      {
        "--app-textfield-resting-label-x": restingLabelX,
        "& .MuiInputLabel-root:not(.MuiInputLabel-shrink)": {
          transform:
            "translate(var(--app-textfield-resting-label-x), 9px) scale(1)",
        },
      },
      ...sxArray.filter(Boolean),
    ];
  }, [restingLabelX, sx]);

  return <TextField {...rest} sx={mergedSx} />;
}
