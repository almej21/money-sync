import { Alert, Snackbar } from "@mui/material";

export default function AppSnackbar({
  open,
  message,
  severity = "info",
  onClose,
  autoHideDuration = 4000,
  anchorOrigin = { vertical: "top", horizontal: "center" },
  topOffset = {
    xs: "calc(env(safe-area-inset-top, 0px) + 122px)",
    sm: "calc(env(safe-area-inset-top, 0px) + 16px)",
  },
  snackbarSx,
  alertSx,
  variant = "filled",
}) {
  const isTopAnchored = anchorOrigin?.vertical === "top";

  return (
    <Snackbar
      open={Boolean(open && message)}
      onClose={onClose}
      autoHideDuration={autoHideDuration}
      anchorOrigin={anchorOrigin}
      sx={[
        {
          zIndex: 2147483647,
          ...(isTopAnchored ? { top: topOffset } : {}),
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
  );
}
