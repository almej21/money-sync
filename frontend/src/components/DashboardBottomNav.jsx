import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import TrackChangesRoundedIcon from "@mui/icons-material/TrackChangesRounded";
import { alpha, Box, Button, useTheme } from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

export default function DashboardBottomNav() {
  const theme = useTheme();
  const location = useLocation();
  const { t } = useLanguage();

  const dashboardBottomTabs = [
    {
      key: "dashboard-charts",
      path: "/dashboard/charts",
      label: t("dashboardCharts"),
      icon: BarChartRoundedIcon,
    },
    {
      key: "dashboard-expenses",
      path: "/",
      label: t("dashboard"),
      icon: FormatListBulletedIcon,
    },
    {
      key: "dashboard-targets",
      path: "/dashboard/targets",
      label: t("dashboardTargets"),
      icon: TrackChangesRoundedIcon,
    },
  ];

  return (
    <>
      <svg
        aria-hidden="true"
        width="0"
        height="0"
        style={{ position: "absolute", pointerEvents: "none" }}
      >
        <defs>
          <filter
            id="dashboard-liquid-glass-filter-mobile"
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation="1"
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
              scale="74.65216865752852"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feColorMatrix
              in="displaced"
              type="saturate"
              result="displaced_saturated"
              values="6"
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
              <feFuncA type="linear" slope="0.4" />
            </feComponentTransfer>
            <feBlend
              in="specular_saturated"
              in2="displaced"
              mode="normal"
              result="withSaturation"
            />
            <feBlend
              in="specular_faded"
              in2="withSaturation"
              mode="normal"
            />
          </filter>
        </defs>
      </svg>
      <Box
        sx={{
          position: "fixed",
          left: "50%",
          bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          transform: "translateX(-50%)",
          width: "min(calc(100vw - 16px), 320px)",
          height: 54,
          zIndex: (activeTheme) => activeTheme.zIndex.appBar + 3,
          isolation: "isolate",
          overflow: "hidden",
          borderRadius: "34px",
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          alignItems: "stretch",
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            pointerEvents: "none",
            position: "absolute",
            inset: 0,
            zIndex: 0,
            borderRadius: "inherit",
            backgroundColor: alpha(theme.palette.common.white, 0.6),
            backdropFilter: 'url("#dashboard-liquid-glass-filter-mobile")',
            WebkitBackdropFilter: 'url("#dashboard-liquid-glass-filter-mobile")',
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
            backdropFilter: "blur(0.8px)",
            WebkitBackdropFilter: "blur(0.8px)",
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
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
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
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
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
            backdropFilter:
              'url("#dashboard-liquid-glass-filter-mobile") blur(0.8px)',
            WebkitBackdropFilter:
              'url("#dashboard-liquid-glass-filter-mobile") blur(0.8px)',
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
            backdropFilter:
              'url("#dashboard-liquid-glass-filter-mobile") blur(0.8px)',
            WebkitBackdropFilter:
              'url("#dashboard-liquid-glass-filter-mobile") blur(0.8px)',
            maskImage:
              "linear-gradient(to bottom, transparent 52%, rgba(0,0,0,0.35) 74%, rgba(0,0,0,0.95) 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 52%, rgba(0,0,0,0.35) 74%, rgba(0,0,0,0.95) 100%)",
          }}
        />
        {[33.333, 66.666].map((leftPercent, index) => (
          <Box
            key={`liquid-seam-${index}`}
            aria-hidden="true"
            sx={{
              pointerEvents: "none",
              position: "absolute",
              top: 8,
              bottom: 8,
              left: `calc(${leftPercent}% - 1px)`,
              width: 2,
              zIndex: 1,
              borderRadius: 1,
              opacity: 0.6,
              background:
                "linear-gradient(to bottom, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.32) 50%, rgba(255,255,255,0.05) 100%)",
            }}
          />
        ))}
        {dashboardBottomTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            tab.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(tab.path);
          return (
            <Button
              key={tab.key}
              component={Link}
              to={tab.path}
              aria-label={tab.label}
              sx={{
                position: "relative",
                zIndex: 2,
                minWidth: 0,
                alignSelf: "center",
                height: "calc(100% - 10px)",
                px: 0,
                mx: "4px",
                borderRadius: "22px",
                backgroundColor: isActive
                  ? alpha(theme.palette.primary.main, 0.4)
                  : "transparent",
                color: isActive
                  ? theme.palette.common.white
                  : alpha(theme.palette.text.primary, 0.88),
                transition:
                  "background-color 180ms ease, color 180ms ease, transform 180ms ease",
                "&:hover": {
                  backgroundColor: isActive
                    ? alpha(theme.palette.primary.main, 0.32)
                    : alpha(theme.palette.common.white, 0.12),
                },
              }}
            >
              <Icon sx={{ fontSize: 24 }} />
            </Button>
          );
        })}
      </Box>
      <Box sx={{ height: "calc(78px + env(safe-area-inset-bottom, 0px))" }} />
    </>
  );
}
