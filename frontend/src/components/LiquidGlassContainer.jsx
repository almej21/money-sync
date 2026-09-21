import { Box } from "@mui/material";
import { LiquidGlass } from "quick-liquid/react";

const getBorderRadius = (cardSx, sx) => {
  const value = cardSx?.borderRadius ?? sx?.borderRadius;

  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 16;
};

export default function LiquidGlassContainer({
  children,
  sx,
  cardSx,
  contentSx,
  ...boxProps
}) {
  const borderRadius = getBorderRadius(cardSx, sx);

  return (
    <LiquidGlass
      as={Box}
      {...boxProps}
      config={{
        // A clear, refractive surface with a pronounced rim—closer to the
        // iOS Liquid Glass treatment than a frosted glass card.
        material: "clear",
        borderRadius,
        blur: 1,
        saturation: 1,
        tint: "255, 255, 255",
        tintOpacity: 0.05,
        refractionStrength: 15,
        bezelWidth: 12,
        thickness: 25,
        ior: 1.48,
        edgeHighlight: 0.95,
        specularStrength: 0.42,
        fresnelPower: 2,
        dynamicLighting: true,
        chromaticAberration: 0.1,
        elevation: 1,
        quality: "high",
        appearance: "auto",
      }}
      sx={[
        {
          position: "relative",
          isolation: "isolate",
          overflow: "hidden",
          border: "none !important",
          borderRadius: "16px",
        },
        cardSx,
        sx,
      ]}
    >
      <Box
        sx={[
          {
            position: "relative",
            zIndex: 2,
            px: { xs: 1, sm: 3 },
          },
          contentSx,
        ]}
      >
        {children}
      </Box>
    </LiquidGlass>
  );
}
