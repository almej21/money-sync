import { Box, useTheme } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";

const DISPLACEMENT_MAP_PATH = "/displacement-map-uihtky.png";
const SPECULAR_MAP_PATH = "/specular-map-uihtky.png";

const LIQUID_GLASS_DEFAULTS = {
  blurStdDeviation: 1,
  refractionScale: 82.94685406392058,
  specularSaturation: 6,
  specularOpacity: 0.4,
};

function getInitialBoxSize() {
  return { width: 320, height: 84 };
}

export default function LiquidGlassBox({
  children,
  sx,
  className,
  refractionScale = LIQUID_GLASS_DEFAULTS.refractionScale,
  blurStdDeviation = LIQUID_GLASS_DEFAULTS.blurStdDeviation,
  specularSaturation = LIQUID_GLASS_DEFAULTS.specularSaturation,
  specularOpacity = LIQUID_GLASS_DEFAULTS.specularOpacity,
  glassBackgroundOpacity = 0.6,
  ...props
}) {
  const theme = useTheme();
  const rootRef = useRef(null);
  const [size, setSize] = useState(getInitialBoxSize);

  const filterId = useMemo(
    () => `liquid-glass-filter-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const glassRgb =
    theme.palette.mode === "dark" ? "34 34 34" : "255 255 255";

  return (
    <Box
      ref={rootRef}
      className={["liquid-glass-box", className].filter(Boolean).join(" ")}
      sx={[
        {
          position: "relative",
          overflow: "hidden",
          isolation: "isolate",
          backdropFilter: `url(#${filterId})`,
          WebkitBackdropFilter: `url(#${filterId})`,
          "--glass-rgb": glassRgb,
          "--glass-bg-alpha": `${Math.max(0, Math.min(1, glassBackgroundOpacity)) * 100}%`,
          "& > :not(.liquid-glass-defs)": {
            position: "relative",
            zIndex: 1,
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    >
      <svg className="liquid-glass-defs" aria-hidden="true" focusable="false">
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={blurStdDeviation}
              result="blurred_source"
            />
            <feImage
              href={DISPLACEMENT_MAP_PATH}
              x="0"
              y="0"
              width={size.width}
              height={size.height}
              result="displacement_map"
            />
            <feDisplacementMap
              in="blurred_source"
              in2="displacement_map"
              scale={refractionScale}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feColorMatrix
              in="displaced"
              type="saturate"
              values={specularSaturation}
              result="displaced_saturated"
            />
            <feImage
              href={SPECULAR_MAP_PATH}
              x="0"
              y="0"
              width={size.width}
              height={size.height}
              result="specular_layer"
            />
            <feComposite
              in="displaced_saturated"
              in2="specular_layer"
              operator="in"
              result="specular_saturated"
            />
            <feComponentTransfer in="specular_layer" result="specular_faded">
              <feFuncA type="linear" slope={specularOpacity} />
            </feComponentTransfer>
            <feBlend
              in="specular_saturated"
              in2="displaced"
              mode="normal"
              result="with_saturation"
            />
            <feBlend in="specular_faded" in2="with_saturation" mode="normal" />
          </filter>
        </defs>
      </svg>
      {children}
    </Box>
  );
}
