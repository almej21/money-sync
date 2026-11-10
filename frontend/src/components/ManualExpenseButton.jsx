import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AddIcon from "@mui/icons-material/Add";
import { Box, IconButton } from "@mui/material";
import LiquidGlassContainer from "./LiquidGlassContainer";

export default function ManualExpenseButton({ label, onClick, sx }) {
  const anchorRef = useRef(null);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const initialScrollX = window.scrollX;
    const initialScrollY = window.scrollY;
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      setPosition({
        left: rect.left + window.scrollX - initialScrollX,
        top: rect.top + window.scrollY - initialScrollY,
      });
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(anchor.parentElement);
    window.addEventListener("resize", updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, []);

  return (
    <>
      <Box component="span" ref={anchorRef} sx={{ display: "inline-block", flexShrink: 0, width: 40, height: 40, ...sx }} />
      {position && createPortal(
        <LiquidGlassContainer
          style={position}
          cardSx={{ position: "fixed", width: 40, height: 40, borderRadius: "50%", zIndex: (theme) => theme.zIndex.appBar + 1 }}
          contentSx={{ px: { xs: 0, sm: 0 }, width: "100%", height: "100%" }}
        >
          <IconButton aria-label={label} title={label} onClick={onClick} sx={{ color: "primary.main", width: 40, height: 40 }}>
            <AddIcon />
          </IconButton>
        </LiquidGlassContainer>,
        document.body,
      )}
    </>
  );
}
