import { Alert, Portal, Snackbar } from "@mui/material";

export default function AppSnackbar({
  open,
  message,
  severity = "info",
  onClose,
  autoHideDuration = 4000,
  anchorOrigin = { vertical: "bottom", horizontal: "center" },
  topOffset = {
    xs: "calc(env(safe-area-inset-top, 0px) + 122px)",
    sm: "calc(env(safe-area-inset-top, 0px) + 16px)",
  },
  bottomOffset = {
    xs: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
    sm: "24px",
  },
  snackbarSx,
  alertSx,
  variant = "filled",
}) {
  const resolvedAnchorOrigin = { vertical: "bottom", horizontal: "center" };
  const isBottomAnchored = true;

  return (
    <Portal>
      <Snackbar
        open={Boolean(open && message)}
        onClose={onClose}
        autoHideDuration={autoHideDuration}
        anchorOrigin={resolvedAnchorOrigin}
        sx={[
          {
            zIndex: (theme) =>
              Math.max(theme.zIndex.snackbar, theme.zIndex.modal + 1000),
            left: { xs: 8, sm: "auto" },
            right: { xs: 8, sm: "auto" },
            maxWidth: {
              xs: "calc(100vw - 16px)",
              sm: "min(560px, calc(100vw - 32px))",
            },
            ...(isBottomAnchored ? { bottom: bottomOffset } : {}),
          },
          ...(Array.isArray(snackbarSx)
            ? snackbarSx
            : snackbarSx
              ? [snackbarSx]
              : []),
        ]}
      >
        <Alert
          onClose={onClose}
          severity={severity}
          variant={variant}
          sx={{
            width: "100%",
            position: "relative",
            ...(onClose
              ? {
                  pl: 5,
                }
              : {}),
            "& .MuiAlert-action": {
              ...(onClose
                ? {
                    position: "absolute",
                    left: 8,
                    right: "auto",
                    top: "50%",
                    transform: "translateY(-50%)",
                    margin: 0,
                    padding: 0,
                  }
                : {}),
            },
            ...alertSx,
          }}
        >
          {message}
        </Alert>
      </Snackbar>
    </Portal>
  );
}
