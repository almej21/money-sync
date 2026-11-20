import { Box } from "@mui/material";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./HorizontalDateRangePicker.css";
import LiquidGlassContainer from "./LiquidGlassContainer";

const FIRST_VALUE = "this_month";

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function makeOptions(date, locale, customRangeLabel, allTimeLabel) {
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "2-digit",
  });
  return [
    { value: FIRST_VALUE, label: formatter.format(date) },
    { value: "custom_range", label: customRangeLabel },
    { value: "all_time", label: allTimeLabel },
    ...Array.from({ length: 6 }, (_, index) => {
      const month = new Date(
        date.getFullYear(),
        date.getMonth() - index - 1,
        1,
      );
      return { value: monthKey(month), label: formatter.format(month) };
    }),
  ];
}

export default function HorizontalDateRangePicker({
  value,
  defaultValue = FIRST_VALUE,
  onChange,
  locale = "en-US",
  disabled = false,
  className,
  labels = {},
}) {
  const {
    customRange = "Custom range",
    allTime = "All time",
    dateRange = "Date range",
  } = labels;
  const [currentMonth, setCurrentMonth] = useState(() => monthKey(new Date()));
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [isScrolling, setIsScrolling] = useState(false);
  const controlled = value !== undefined;
  const options = useMemo(() => {
    const [year, month] = currentMonth.split("-").map(Number);
    return makeOptions(
      new Date(year, month - 1, 1),
      locale,
      customRange,
      allTime,
    );
  }, [currentMonth, locale, customRange, allTime]);
  const requestedValue = controlled ? value : internalValue;
  const selectedValue = options.some(
    (option) => option.value === requestedValue,
  )
    ? requestedValue
    : FIRST_VALUE;
  const selectedIndex = options.findIndex(
    (option) => option.value === selectedValue,
  );

  const viewportRef = useRef(null);
  const itemsRef = useRef([]);
  const optionsRef = useRef(options);
  const selectedRef = useRef(selectedValue);
  const requestedRef = useRef(requestedValue);
  const onChangeRef = useRef(onChange);
  const controlledRef = useRef(controlled);
  const disabledRef = useRef(disabled);
  const settleTimer = useRef(null);
  const scrollAnimationTimer = useRef(null);
  const reconcileTimer = useRef(null);
  const interactionRef = useRef(null);
  const targetRef = useRef(null);
  const touchRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const invalidNotifiedRef = useRef(null);
  optionsRef.current = options;
  selectedRef.current = selectedValue;
  requestedRef.current = requestedValue;
  onChangeRef.current = onChange;
  controlledRef.current = controlled;
  disabledRef.current = disabled;

  const center = useCallback((index, smooth = true) => {
    const viewport = viewportRef.current;
    const item = itemsRef.current[index];
    if (!viewport || !item) return;
    const viewportRect = viewport.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const offset =
      itemRect.left +
      itemRect.width / 2 -
      viewportRect.left -
      viewportRect.width / 2;
    if (Math.abs(offset) <= 1) return;
    const left = viewport.scrollLeft + offset;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    viewport.scrollTo({
      left,
      behavior: smooth && !reducedMotion ? "smooth" : "auto",
    });
  }, []);

  const nearestIndex = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return 0;
    const rect = viewport.getBoundingClientRect();
    const middle = rect.left + rect.width / 2;
    let nearest = 0;
    let distance = Infinity;
    itemsRef.current.forEach((item, index) => {
      if (!item) return;
      const itemRect = item.getBoundingClientRect();
      const nextDistance = Math.abs(
        itemRect.left + itemRect.width / 2 - middle,
      );
      if (nextDistance < distance) {
        distance = nextDistance;
        nearest = index;
      }
    });
    return nearest;
  }, []);

  const settle = useCallback(() => {
    clearTimeout(settleTimer.current);
    if (dragRef.current || touchRef.current !== null) return;
    const interaction = interactionRef.current;
    if (!interaction) return;
    const index = nearestIndex();
    const nextValue = optionsRef.current[index]?.value;
    if (!nextValue) return;
    const viewport = viewportRef.current;
    const item = itemsRef.current[index];
    const viewportRect = viewport.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (
      Math.abs(
        itemRect.left +
          itemRect.width / 2 -
          viewportRect.left -
          viewportRect.width / 2,
      ) > 1
    ) {
      center(index);
      // An already centered or reduced-motion scroll may not emit scrollend.
      settleTimer.current = setTimeout(settle, 180);
      return;
    }
    interactionRef.current = null;
    targetRef.current = null;
    if (interaction === "external") return;
    if (nextValue !== selectedRef.current) {
      if (!controlledRef.current) setInternalValue(nextValue);
      onChangeRef.current?.(nextValue);
    }
    if (controlledRef.current) {
      clearTimeout(reconcileTimer.current);
      reconcileTimer.current = setTimeout(() => {
        const selected = optionsRef.current.findIndex(
          (option) => option.value === selectedRef.current,
        );
        if (selected >= 0 && optionsRef.current[selected].value !== nextValue) {
          interactionRef.current = "external";
          center(selected);
          settleTimer.current = setTimeout(settle, 180);
        }
      }, 100);
    }
  }, [center, nearestIndex]);

  const scheduleSettle = useCallback(() => {
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(settle, 180);
  }, [settle]);

  const animateScroll = useCallback(() => {
    setIsScrolling(true);
    clearTimeout(scrollAnimationTimer.current);
    scrollAnimationTimer.current = setTimeout(() => setIsScrolling(false), 180);
  }, []);

  const navigate = useCallback(
    (index) => {
      if (disabledRef.current) return;
      const target = Math.max(
        0,
        Math.min(optionsRef.current.length - 1, index),
      );
      interactionRef.current = "user";
      targetRef.current = target;
      center(target);
      scheduleSettle();
    },
    [center, scheduleSettle],
  );

  // Schedule the next local month boundary, and recheck after sleep or a clock change.
  useEffect(() => {
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      const now = new Date();
      setCurrentMonth(monthKey(now));
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      timer = setTimeout(refresh, Math.min(nextMonth - now + 50, 2147483647));
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (requestedValue === selectedValue) {
      invalidNotifiedRef.current = null;
      return;
    }
    if (!controlled) setInternalValue(FIRST_VALUE);
    const invalidKey = `${currentMonth}:${String(requestedValue)}`;
    if (invalidNotifiedRef.current !== invalidKey) {
      invalidNotifiedRef.current = invalidKey;
      onChangeRef.current?.(FIRST_VALUE);
    }
  }, [requestedValue, selectedValue, controlled, currentMonth]);

  // Measure the real option width so both ends have enough room to center.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const measure = () => {
      const item = itemsRef.current[0];
      if (!item) return;
      viewport.style.setProperty(
        "--picker-item-width",
        `${item.getBoundingClientRect().width}px`,
      );
      interactionRef.current = "external";
      targetRef.current = null;
      clearTimeout(settleTimer.current);
      center(
        optionsRef.current.findIndex(
          (option) => option.value === selectedRef.current,
        ),
        false,
      );
      scheduleSettle();
    };
    measure();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    observer?.observe(viewport);
    if (itemsRef.current[0]) observer?.observe(itemsRef.current[0]);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [center, options, scheduleSettle]);

  useLayoutEffect(() => {
    clearTimeout(reconcileTimer.current);
    interactionRef.current = "external";
    center(selectedIndex);
    scheduleSettle();
  }, [selectedIndex, selectedValue, center, scheduleSettle]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const supportsScrollEnd = "onscrollend" in viewport;
    const onScroll = () => {
      animateScroll();
      if (!interactionRef.current && !disabledRef.current)
        interactionRef.current = "user";
      if (supportsScrollEnd) {
        // Let native momentum and snap finish before committing a selection.
        clearTimeout(settleTimer.current);
      } else if (interactionRef.current) {
        scheduleSettle();
      }
    };
    const onScrollEnd = () => {
      // Setting scrollLeft during a mouse drag can emit scrollend between
      // pointer moves. Keep the movement debounce in charge until release.
      if (dragRef.current?.moved) return;
      clearTimeout(scrollAnimationTimer.current);
      setIsScrolling(false);
      settle();
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("scrollend", onScrollEnd);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("scrollend", onScrollEnd);
      clearTimeout(settleTimer.current);
      clearTimeout(scrollAnimationTimer.current);
      clearTimeout(reconcileTimer.current);
    };
  }, [animateScroll, scheduleSettle, settle]);

  const startUserScroll = () => {
    if (!disabled) {
      interactionRef.current = "user";
      targetRef.current = null;
    }
  };
  const onPointerDown = (event) => {
    if (disabled) return;
    startUserScroll();
    if (event.pointerType !== "mouse") {
      touchRef.current = event.pointerId;
      return;
    }
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    dragRef.current = {
      x: event.clientX,
      scrollLeft: event.currentTarget.scrollLeft,
      moved: false,
      id: event.pointerId,
    };
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const delta = event.clientX - drag.x;
    if (!drag.moved && Math.abs(delta) > 5) {
      drag.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add("is-dragging");
    }
    if (drag.moved) {
      event.preventDefault();
      animateScroll();
      event.currentTarget.scrollLeft = drag.scrollLeft - delta;
    }
  };
  const endPointer = (event) => {
    if (touchRef.current === event.pointerId) {
      touchRef.current = null;
      scheduleSettle();
    }
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved) {
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      navigate(nearestIndex());
    }
  };
  const onKeyDown = (event) => {
    if (disabled) return;
    const base =
      targetRef.current ??
      (interactionRef.current === "user" ? nearestIndex() : selectedIndex);
    const target = {
      ArrowLeft: base - 1,
      ArrowRight: base + 1,
      Home: 0,
      End: options.length - 1,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    navigate(target);
  };

  return (
    <Box
      className={className}
      role="group"
      aria-label={dateRange}
      dir="ltr"
      onKeyDown={onKeyDown}
      sx={{
        display: "flex",
        alignItems: "center",
        minWidth: 0,
        width: "100%",
        gap: { xs: 0, sm: 0.5 },
      }}
    >
      <Box className="horizontal-date-range-picker__window">
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: "50%",
            transform: `translateX(-50%) scale(${isScrolling ? 1.08 : 1})`,
            boxShadow: isScrolling
              ? "0 8px 20px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.12)"
              : "0 0 0 rgba(0, 0, 0, 0)",
            transition:
              "transform 220ms ease-in-out, box-shadow 220ms ease-in-out",
            "@media (prefers-reduced-motion: reduce)": {
              transition: "none",
              transform: "translateX(-50%)",
            },
            width: "min(75%, max(96px, calc(100% / 5 - 32px)))",
            borderRadius: "10px",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          <LiquidGlassContainer
            cardSx={{ position: "absolute", inset: 0, borderRadius: "10px" }}
            contentSx={{ p: 0 }}
          />
        </Box>
        <Box
          ref={viewportRef}
          className="horizontal-date-range-picker__viewport"
          dir="ltr"
          aria-disabled={disabled || undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onLostPointerCapture={endPointer}
          onWheel={startUserScroll}
          onPointerLeave={(event) => {
            if (dragRef.current && !dragRef.current.moved) endPointer(event);
          }}
          onClickCapture={(event) => {
            if (suppressClickRef.current) {
              event.preventDefault();
              event.stopPropagation();
              suppressClickRef.current = false;
            }
          }}
          sx={{
            overflowX: disabled ? "hidden" : "auto",
            "& .horizontal-date-range-picker__option": {
              color: "text.secondary",
              bgcolor: "background.paper",
              fontWeight: 700,
              "&[aria-pressed='true']": {
                color: "primary.main",
                bgcolor: "transparent",
              },
              "&:focus-visible": {
                outline: (theme) => `2px solid ${theme.palette.primary.main}`,
                outlineOffset: "-3px",
              },
            },
          }}
        >
          {options.map((option, index) => (
            <Box
              key={option.value}
              ref={(element) => {
                itemsRef.current[index] = element;
              }}
              className="horizontal-date-range-picker__item"
            >
              <button
                type="button"
                className="horizontal-date-range-picker__option"
                title={option.label}
                aria-pressed={selectedValue === option.value}
                disabled={disabled}
                onClick={() => navigate(index)}
              >
                {option.label}
              </button>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
