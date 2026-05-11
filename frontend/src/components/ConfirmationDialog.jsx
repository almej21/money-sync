import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";

export default function ConfirmationDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onClose,
  onConfirm,
  disabled,
  confirmColor = "error",
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography color="text.primary">{description}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={disabled}>
          {cancelLabel}
        </Button>
        <Button
          color={confirmColor}
          variant="contained"
          onClick={onConfirm}
          disabled={disabled}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
