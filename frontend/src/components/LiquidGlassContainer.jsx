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

const isIOS = () => {
  if (typeof navigator === "undefined") return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
};

export default function LiquidGlassContainer({
  children,
  sx,
  cardSx,
  contentSx,
  ...boxProps
}) {
  const borderRadius = getBorderRadius(cardSx, sx);
  const glassConfig = isIOS()
    ? {
        // WebKit cannot render Quick Liquid's SVG backdrop refraction.
        // Use a more visible native-CSS glass treatment on iPhone and iPad.
        material: "thin",
        borderRadius,
        blur: 8,
        saturation: 1.35,
        tint: "255, 255, 255",
        tintOpacity: 0.1,
        refractionStrength: 0,
        refractionMode: "css",
        edgeHighlight: 0.8,
        specularStrength: 0.3,
        dynamicLighting: false,
        chromaticAberration: 0,
        elevation: 1,
        quality: "high",
        appearance: "auto",
      }
    : {
        // Chromium uses Quick Liquid's full SVG-backed refraction path.
        material: "clear",
        borderRadius,
        blur: 1,
        saturation: 1,
        tint: "255, 255, 255",
        tintOpacity: 0.05,
        refractionStrength: 15,
        bezelWidth: 8,
        thickness: 2,
        ior: 1.48,
        edgeHighlight: 0.95,
        specularStrength: 0.42,
        fresnelPower: 2,
        dynamicLighting: true,
        chromaticAberration: .5,
        elevation: 1,
        quality: "high",
        appearance: "auto",
      };

  return (
    <LiquidGlass
      as={Box}
      {...boxProps}
      config={glassConfig}
      sx={[
        {
          position: "relative",
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
