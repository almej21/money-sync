import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Fade,
  IconButton,
  Modal,
  Stack,
  Typography,
} from "@mui/material";

export default function GenericModal({
  open,
  onClose,
  headerText = "",
  headerIcon = null,
  children,
  width = 560,
  showCloseButton = true,
}) {
  return (
    <Modal
      open={Boolean(open)}
      onClose={onClose}
      closeAfterTransition
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: "blur(8px)",
            backgroundColor: "rgba(0, 0, 0, 0.55)",
          },
        },
      }}
    >
      <Fade in={Boolean(open)}>
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: { xs: "92vw", sm: width },
            maxHeight: "85vh",
            overflowY: "auto",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            boxShadow: 24,
            pt: 1,
            pb: 2,
            px: 2,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 1.5 }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              {headerIcon}
              <Typography variant="subtitle1">{headerText}</Typography>
            </Stack>
            {showCloseButton && (
              <IconButton aria-label="Close modal" onClick={onClose} size="small">
                <CloseIcon />
              </IconButton>
            )}
          </Stack>
          <Box>{children}</Box>
        </Box>
      </Fade>
    </Modal>
  );
}
