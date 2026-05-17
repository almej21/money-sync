import { keyframes } from "@emotion/react";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import PieChartRoundedIcon from "@mui/icons-material/PieChartRounded";
import { alpha, Box, Button, useTheme } from "@mui/material";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import LiquidGlassContainer from "./LiquidGlassContainer";

const toggleStretchEdgeA = keyframes`
  0% { transform: scaleX(1); }
  50% { transform: scaleX(1.1); }r
  100% { transform: scaleX(1); }
`;
const toggleStretchEdgeB = keyframes`
  0% { transform: scaleX(1); }
  50% { transform: scaleX(1.1); }
  100% { transform: scaleX(1); }
`;
const toggleStretchMiddleA = keyframes`
  0% { transform: scaleX(1); }
  50% { transform: scaleX(1.2); }
  100% { transform: scaleX(1); }
`;
const toggleStretchMiddleB = keyframes`
  0% { transform: scaleX(1); }
  50% { transform: scaleX(1.2); }
  100% { transform: scaleX(1); }
`;
const iconPressPop = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.08); }
  100% { transform: scale(1); }
`;

export default function DashboardBottomNav() {
  const theme = useTheme();
  const location = useLocation();
  const { t } = useLanguage();

  const dashboardBottomTabs = useMemo(
    () => [
      {
        key: "dashboard-charts",
        path: "/dashboard/charts",
        label: t("dashboardCharts"),
        icon: BarChartRoundedIcon,
        iconOffsetX: 0.75,
      },
      {
        key: "dashboard-expenses",
        path: "/",
        label: t("dashboard"),
        icon: FormatListBulletedIcon,
        iconOffsetX: 0,
      },
      {
        key: "dashboard-targets",
        path: "/dashboard/targets",
        label: t("dashboardTargets"),
        icon: PieChartRoundedIcon,
        iconOffsetX: -0.75,
      },
    ],
    [t],
  );

  const activeIndex = useMemo(() => {
    const foundIndex = dashboardBottomTabs.findIndex((tab) =>
      tab.path === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(tab.path),
    );
    return foundIndex >= 0 ? foundIndex : 1;
  }, [dashboardBottomTabs, location.pathname]);

  const [previousIndex, setPreviousIndex] = useState(activeIndex);
  const [toggleAnimationCycle, setToggleAnimationCycle] = useState(0);
  const previousIndexRef = useRef(activeIndex);

  useLayoutEffect(() => {
    const prev = previousIndexRef.current;
    if (prev === activeIndex) return;
    setPreviousIndex(prev);
    previousIndexRef.current = activeIndex;
    setToggleAnimationCycle((current) => current + 1);
  }, [activeIndex]);

  const toggleAnimationName =
    activeIndex === previousIndex
      ? "none"
      : activeIndex === 1
        ? toggleAnimationCycle % 2 === 0
          ? toggleStretchMiddleA
          : toggleStretchMiddleB
        : toggleAnimationCycle % 2 === 0
          ? toggleStretchEdgeA
          : toggleStretchEdgeB;
  const toggleTransformOrigin =
    activeIndex === previousIndex
      ? "center center"
      : activeIndex > previousIndex
        ? "left center"
        : "right center";

  return (
    <>
      <LiquidGlassContainer
        cardSx={{
          position: "fixed",
          left: "50%",
          bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          transform: "translateX(-50%)",
          direction: "ltr",
          width: "min(calc(100vw - 16px), 320px)",
          height: 54,
          zIndex: (activeTheme) => activeTheme.zIndex.appBar + 3,
          isolation: "isolate",
          overflow: "hidden",
          borderRadius: "34px",
        }}
        contentSx={{
          px: 0,
          py: 0,
          height: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          alignItems: "stretch",
        }}
      >
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
        <Box
          aria-hidden="true"
          sx={{
            pointerEvents: "none",
            position: "absolute",
            top: 4,
            left: `calc(6px + (${activeIndex} * ((100% - 12px) / 3)))`,
            width: "calc((100% - 12px) / 3)",
            height: "calc(100% - 10px)",
            zIndex: 1,
            borderRadius: "22px",
            backgroundColor: alpha(theme.palette.primary.main, 0.75),
            boxShadow: `
              inset 0 0 0 1px ${alpha(theme.palette.common.white, 0.2)},
              inset 1px 1px 0 ${alpha(theme.palette.common.white, 0.24)},
              inset -1px -1px 0 ${alpha(theme.palette.common.black, 0.12)},
              0 3px 6px ${alpha(theme.palette.common.black, 0.1)}
            `,
            transform: "scaleX(1)",
            transformOrigin: toggleTransformOrigin,
            transition:
              "left 240ms cubic-bezier(1, 0, 0.4, 1), background-color 240ms cubic-bezier(1, 0, 0.4, 1), box-shadow 240ms cubic-bezier(1, 0, 0.4, 1)",
            animation:
              toggleAnimationName === "none"
                ? "none"
                : `${toggleAnimationName} 264ms ease`,
          }}
        />
        {dashboardBottomTabs.map((tab) => {
          const Icon = tab.icon;
          const iconOffsetX = Number(tab.iconOffsetX || 0);
          const isActive =
            tab.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(tab.path);
          return (
            <Button
              key={tab.key}
              component={Link}
              to={tab.path}
              disableRipple
              disableTouchRipple
              focusRipple={false}
              aria-label={tab.label}
              sx={{
                position: "relative",
                zIndex: 2,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                alignSelf: "center",
                height: "calc(100% - 10px)",
                lineHeight: 0,
                px: 0,
                mx: "4px",
                borderRadius: "22px",
                backgroundColor: "transparent",
                color: isActive
                  ? theme.palette.common.white
                  : alpha(theme.palette.text.primary, 0.88),
                WebkitTapHighlightColor: "transparent",
                transition:
                  "background-color 108ms ease, color 108ms ease, transform 108ms ease",
                "&:hover": {
                  backgroundColor: "transparent",
                },
                "&:active": {
                  backgroundColor: "transparent",
                },
                "&.Mui-focusVisible": {
                  backgroundColor: "transparent",
                },
                "&:hover .dashboard-bottom-nav-icon": {
                  transform: "scale(1.2)",
                },
              }}
            >
              <Icon
                className="dashboard-bottom-nav-icon"
                sx={{
                  fontSize: 24,
                  display: "block",
                  transform: `translateX(${iconOffsetX}px) scale(1)`,
                  transition: "transform 120ms cubic-bezier(0.5, 0, 0, 1)",
                  animation: isActive
                    ? `${iconPressPop} 156ms cubic-bezier(0.5, 0, 0, 1)`
                    : "none",
                }}
              />
            </Button>
          );
        })}
      </LiquidGlassContainer>
      <Box sx={{ height: "calc(78px + env(safe-area-inset-bottom, 0px))" }} />
    </>
  );
}
