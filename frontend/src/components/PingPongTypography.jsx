import { Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";

export default function PingPongTypography({
  children,
  enablePingPongEffect = true,
  sx,
  ...typographyProps
}) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [overflowDistance, setOverflowDistance] = useState(0);

  useEffect(() => {
    if (!enablePingPongEffect) {
      setIsOverflowing(false);
      setOverflowDistance(0);
      return;
    }

    function recalculate() {
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      const nextDistance = Math.max(
        0,
        content.scrollWidth - container.clientWidth,
      );
      setOverflowDistance(nextDistance);
      setIsOverflowing(nextDistance > 0);
    }

    recalculate();

    const resizeObserver = new ResizeObserver(() => recalculate());
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    if (contentRef.current) resizeObserver.observe(contentRef.current);

    window.addEventListener("resize", recalculate);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", recalculate);
    };
  }, [children, enablePingPongEffect]);

  const animationDuration = useMemo(() => {
    if (!isOverflowing) return "0s";
    const base = 3.5;
    const extra = Math.min(8, overflowDistance / 55);
    return `${base + extra}s`;
  }, [isOverflowing, overflowDistance]);

  const shouldAnimate = enablePingPongEffect && isOverflowing;

  if (!enablePingPongEffect) {
    return (
      <Typography sx={sx} {...typographyProps}>
        {children}
      </Typography>
    );
  }

  return (
    <Typography
      ref={containerRef}
      sx={[
        {
          overflow: "hidden",
          whiteSpace: "nowrap",
          "@keyframes pingPongMarquee": {
            "0%": { transform: "translateX(0)" },
            "100%": {
              transform: `translateX(calc(-1 * var(--ping-pong-distance, 0px)))`,
            },
          },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
      {...typographyProps}
    >
      <span
        ref={contentRef}
        style={{
          display: "inline-block",
          willChange: shouldAnimate ? "transform" : "auto",
          animationName: shouldAnimate ? "pingPongMarquee" : "none",
          animationDuration,
          animationTimingFunction: "ease-in-out",
          animationIterationCount: "infinite",
          animationDirection: "alternate",
          ["--ping-pong-distance"]: `${overflowDistance}px`,
        }}
      >
        {children}
      </span>
    </Typography>
  );
}
