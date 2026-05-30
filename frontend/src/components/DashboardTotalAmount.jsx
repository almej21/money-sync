import { alpha, Box, Skeleton, Typography, useTheme } from "@mui/material";
import NumberFlow from "@number-flow/react";
import { memo } from "react";

const NUMBER_FLOW_FORMAT = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};
const NUMBER_FLOW_TRANSFORM_TIMING = {
  duration: 600,
  easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
};
const NUMBER_FLOW_SPIN_TIMING = {
  duration: 600,
  easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
};
const NUMBER_FLOW_OPACITY_TIMING = {
  duration: 500,
  easing: "ease-out",
};
const NUMBER_FLOW_NO_ANIMATION_TIMING = {
  duration: 0,
  easing: "linear",
};

function DashboardTotalAmount({
  direction,
  shouldShowTotalLoading,
  currency,
  animatedTotalAmount,
  suppressAnimation = false,
}) {
  const theme = useTheme();
  const transformTiming = suppressAnimation
    ? NUMBER_FLOW_NO_ANIMATION_TIMING
    : NUMBER_FLOW_TRANSFORM_TIMING;
  const spinTiming = suppressAnimation
    ? NUMBER_FLOW_NO_ANIMATION_TIMING
    : NUMBER_FLOW_SPIN_TIMING;
  const opacityTiming = suppressAnimation
    ? NUMBER_FLOW_NO_ANIMATION_TIMING
    : NUMBER_FLOW_OPACITY_TIMING;

  return (
    <Typography
      dir={direction}
      sx={{
        mb: 1.5,
        px: { xs: 0.5, sm: 0.75 },
        textAlign: direction === "rtl" ? "right" : "left",
        fontSize: "3rem",
        width: "100%",
        display: "flex",
        justifyContent: "flex-start",
      }}
    >
      <Box
        component="span"
        dir="ltr"
        sx={{
          display: "inline-flex",
          justifyContent: "flex-start",
          alignItems: "baseline",
          flexDirection: "row",
          unicodeBidi: "bidi-override",
          gap: 0.5,
        }}
      >
        {shouldShowTotalLoading ? (
          <>
            <Skeleton
              variant="rounded"
              width={28}
              height={28}
              sx={{ bgcolor: alpha(theme.palette.text.secondary, 0.2) }}
            />
            <Skeleton
              variant="rounded"
              width={140}
              height={42}
              sx={{ bgcolor: alpha(theme.palette.text.secondary, 0.2) }}
            />
          </>
        ) : (
          <>
            <Box
              component="span"
              sx={{
                display: "inline-block",
                fontWeight: 400,
                color: "text.secondary",
              }}
            >
              {currency}
            </Box>

            <Box
              component="span"
              sx={{
                display: "inline-block",
                fontWeight: 800,
              }}
            >
              <NumberFlow
                value={animatedTotalAmount}
                format={NUMBER_FLOW_FORMAT}
                transformTiming={transformTiming}
                spinTiming={spinTiming}
                opacityTiming={opacityTiming}
              />
            </Box>
          </>
        )}
      </Box>
    </Typography>
  );
}

export default memo(
  DashboardTotalAmount,
  (prev, next) =>
    prev.direction === next.direction &&
    prev.shouldShowTotalLoading === next.shouldShowTotalLoading &&
    prev.currency === next.currency &&
    prev.animatedTotalAmount === next.animatedTotalAmount &&
    prev.suppressAnimation === next.suppressAnimation,
);
