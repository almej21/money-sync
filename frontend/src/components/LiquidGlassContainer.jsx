import { alpha, Box, useTheme } from "@mui/material";
import { useMemo } from "react";

export default function LiquidGlassContainer({
  children,
  sx,
  cardSx,
  contentSx,
  specularOpacity = 1,
  specularSaturation = 3,
  refractionLevel = 50,
  blurLevel = 0.4,
  progressiveBlurStrength = 1,
  glassBackgroundOpacity = 0,
  ...boxProps
}) {
  const theme = useTheme();
  const filterId = useMemo(
    () => `liquid-glass-filter-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );
  const safeSpecularOpacity = Number.isFinite(specularOpacity)
    ? Math.max(0, specularOpacity)
    : 0.4;
  const safeSpecularSaturation = Number.isFinite(specularSaturation)
    ? Math.max(0, specularSaturation)
    : 6;
  const safeRefractionLevel = Number.isFinite(refractionLevel)
    ? Math.max(0, refractionLevel)
    : 74.65216865752852;
  const safeBlurLevel = Number.isFinite(blurLevel)
    ? Math.max(0, blurLevel)
    : 0.8;
  const safeProgressiveBlurStrength = Number.isFinite(progressiveBlurStrength)
    ? Math.max(0, progressiveBlurStrength)
    : 1;
  const safeGlassBackgroundOpacity = Number.isFinite(glassBackgroundOpacity)
    ? Math.max(0, Math.min(1, glassBackgroundOpacity))
    : 0.4;
  const sourceBlurStdDeviation = safeBlurLevel * 0.875;
  const progressiveBlurSmall = safeBlurLevel * safeProgressiveBlurStrength;
  const progressiveBlurMedium =
    safeBlurLevel * 2.5 * safeProgressiveBlurStrength;
  const progressiveBlurLarge = safeBlurLevel * 5 * safeProgressiveBlurStrength;

  return (
    <Box
      {...boxProps}
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
      <svg
        aria-hidden="true"
        width="0"
        height="0"
        style={{ position: "absolute", pointerEvents: "none" }}
      >
        <defs>
          <filter
            id={filterId}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={sourceBlurStdDeviation}
              result="blurred_source"
            />
            <feImage
              href="/displacement-map-ivknpp.png"
              x="0"
              y="0"
              width="320"
              height="54"
              result="displacement_map"
            />
            <feDisplacementMap
              in="blurred_source"
              in2="displacement_map"
              scale={safeRefractionLevel}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feColorMatrix
              in="displaced"
              type="saturate"
              result="displaced_saturated"
              values={safeSpecularSaturation}
            />
            <feImage
              href="/specular-map-ivknpp.png"
              x="0"
              y="0"
              width="320"
              height="54"
              result="specular_layer"
            />
            <feComposite
              in="displaced_saturated"
              in2="specular_layer"
              operator="in"
              result="specular_saturated"
            />
            <feComponentTransfer in="specular_layer" result="specular_faded">
              <feFuncA type="linear" slope={safeSpecularOpacity} />
            </feComponentTransfer>
            <feBlend
              in="specular_saturated"
              in2="displaced"
              mode="normal"
              result="withSaturation"
            />
            <feBlend in="specular_faded" in2="withSaturation" mode="normal" />
          </filter>
        </defs>
      </svg>

      <Box
        aria-hidden="true"
        sx={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          zIndex: 0,
          borderRadius: "inherit",
          backgroundColor: alpha(
            theme.palette.common.white,
            safeGlassBackgroundOpacity,
          ),
          backdropFilter: `url("#${filterId}")`,
          WebkitBackdropFilter: `url("#${filterId}")`,
          boxShadow: "0 4px 19px rgba(0, 0, 0, 0.16)",
        }}
      />
      <Box
        aria-hidden="true"
        sx={{
          pointerEvents: "none",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "100%",
          zIndex: 0,
          backdropFilter: `blur(${progressiveBlurSmall}px)`,
          WebkitBackdropFilter: `blur(${progressiveBlurSmall}px)`,
          maskImage:
            "linear-gradient(to bottom, transparent 68%, rgba(0,0,0,1) 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 68%, rgba(0,0,0,1) 100%)",
        }}
      />
      <Box
        aria-hidden="true"
        sx={{
          pointerEvents: "none",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "100%",
          zIndex: 0,
          backdropFilter: `blur(${progressiveBlurMedium}px)`,
          WebkitBackdropFilter: `blur(${progressiveBlurMedium}px)`,
          maskImage:
            "linear-gradient(to bottom, transparent 50%, rgba(0,0,0,1) 76%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 50%, rgba(0,0,0,1) 76%)",
        }}
      />
      <Box
        aria-hidden="true"
        sx={{
          pointerEvents: "none",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "100%",
          zIndex: 0,
          backdropFilter: `blur(${progressiveBlurLarge}px)`,
          WebkitBackdropFilter: `blur(${progressiveBlurLarge}px)`,
          maskImage:
            "linear-gradient(to bottom, transparent 20%, rgba(0,0,0,1) 55%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 20%, rgba(0,0,0,1) 55%)",
        }}
      />
      <Box
        aria-hidden="true"
        sx={{
          pointerEvents: "none",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "100%",
          zIndex: 0,
          backdropFilter: `url("#${filterId}") blur(${progressiveBlurSmall}px)`,
          WebkitBackdropFilter: `url("#${filterId}") blur(${progressiveBlurSmall}px)`,
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.35) 26%, transparent 48%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.35) 26%, transparent 48%)",
        }}
      />
      <Box
        aria-hidden="true"
        sx={{
          pointerEvents: "none",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "100%",
          zIndex: 0,
          backdropFilter: `url("#${filterId}") blur(${progressiveBlurSmall}px)`,
          WebkitBackdropFilter: `url("#${filterId}") blur(${progressiveBlurSmall}px)`,
          maskImage:
            "linear-gradient(to bottom, transparent 52%, rgba(0,0,0,0.35) 74%, rgba(0,0,0,0.95) 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 52%, rgba(0,0,0,0.35) 74%, rgba(0,0,0,0.95) 100%)",
        }}
      />

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
    </Box>
  );
}
