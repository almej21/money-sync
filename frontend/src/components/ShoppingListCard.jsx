import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import EditSquareIcon from "@mui/icons-material/EditSquare";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Collapse,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import AppTextField from "./AppTextField";

export default function ShoppingListCard({
  list,
  isExpanded,
  onToggleExpanded,
  onEdit,
  onDelete,
  onToggleItem,
  expandedNoteEditorKey,
  onToggleNoteEditor,
  getItemNoteEditorKey,
  getDraftNoteValue,
  onNoteDraftChange,
  onSaveNote,
  isSavingNote,
  formatCreatedAt,
  compactInputHeight,
  isRtl,
  direction,
  t,
}) {
  const listItems = Array.isArray(list.items) ? list.items : [];
  const allItemsCompleted =
    listItems.length > 0 && listItems.every((item) => Boolean(item?.completed));
  const toggleNoteEditor = (item) => onToggleNoteEditor(list._id, item._id);

  return (
    <Card>
      <CardContent
        sx={{
          px: 1,
          py: 1.25,
          "&:last-child": { pb: isExpanded ? 1.5 : 1.25 },
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr 116px",
            alignItems: "center",
            columnGap: 1,
            mb: isExpanded ? 1 : 0,
          }}
        >
          <Stack
            direction="row"
            alignItems="baseline"
            spacing={0.75}
            onClick={onToggleExpanded}
            sx={{ cursor: "pointer" }}
          >
            <Typography
              variant="h8"
              sx={{
                textDecoration: allItemsCompleted
                  ? "line-through"
                  : "underline",
                textDecorationThickness: allItemsCompleted ? "1.5px" : "2px",
                textUnderlineOffset: allItemsCompleted ? "0px" : "5px",
                opacity: allItemsCompleted ? 0.75 : 1,
              }}
            >
              {list.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
              ({listItems.length} {t("itemsCountLabel")})
            </Typography>
          </Stack>
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              direction: "ltr",
              alignItems: "center",
              justifyContent: "flex-end",
              columnGap: 0.8,
              width: 116,
            }}
          >
            <Button
              variant="outlined"
              size="small"
              onClick={onToggleExpanded}
              aria-label={isExpanded ? t("hideDetails") : t("showDetails")}
              sx={{
                minWidth: 0,
                width: 32,
                height: 32,
                p: 0,
                borderRadius: 0.8,
                border: "2px solid",
              }}
            >
              {isExpanded ? (
                <ExpandLessIcon fontSize="small" />
              ) : (
                <ExpandMoreIcon fontSize="small" />
              )}
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={onEdit}
              sx={{
                minWidth: 0,
                width: 32,
                height: 32,
                p: 0,
                borderRadius: 0.8,
                border: "2px solid",
              }}
            >
              <EditOutlinedIcon fontSize="small" />
            </Button>
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={onDelete}
              sx={{
                minWidth: 0,
                width: 32,
                height: 32,
                p: 0,
                borderRadius: 0.8,
                borderColor: "error.main",
                border: "2px solid",
                color: "error.main",
                "&:hover": {
                  bgcolor: "error.main",
                  borderColor: "error.main",
                  color: "common.white",
                },
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </Button>
          </Box>
        </Box>
        <Collapse in={isExpanded}>
          <Divider sx={{ mb: 1.5 }} />
          <List disablePadding>
            {listItems.map((item, index) => {
              const noteEditorOpen =
                expandedNoteEditorKey ===
                getItemNoteEditorKey(list._id, item._id);
              const itemText = `${item.description || item.text || "-"} x${item.quantity}`;
              const textProps = {
                dir: direction,
                sx: {
                  textAlign: isRtl ? "left" : "right",
                  fontSize: "0.9rem",
                  wordBreak: "break-word",
                  textDecoration: item.completed ? "line-through" : "none",
                  opacity: item.completed ? 0.7 : 1,
                },
              };
              const noteButton = (
                <IconButton
                  size="small"
                  onClick={() => toggleNoteEditor(item)}
                  aria-label={t("addNote")}
                  sx={{ alignSelf: "center", p: 0.2 }}
                >
                  <EditSquareIcon fontSize="small" />
                </IconButton>
              );
              const checkBox = (
                <Checkbox
                  checked={Boolean(item.completed)}
                  onChange={() => onToggleItem(list._id, item._id)}
                  size="small"
                  sx={{ p: 0.7, ...(isRtl ? { mr: 0.15 } : { ml: 0.15 }) }}
                />
              );
              return (
                <Box key={item._id}>
                  <ListItem disableGutters sx={{ py: 0 }}>
                    <Stack
                      direction="row"
                      justifyContent="flex-start"
                      alignItems="center"
                      spacing={1}
                      sx={{ width: "100%", minHeight: 24 }}
                    >
                      <Stack
                        direction="row"
                        alignItems="center"
                        sx={{ minWidth: 0, width: "100%", minHeight: 24 }}
                      >
                        {isRtl && checkBox}
                        {!isRtl && noteButton}
                        <ListItemText
                          primary={itemText}
                          primaryTypographyProps={textProps}
                          sx={{
                            my: 0,
                            mx: 0.25,
                            "& .MuiTypography-root": { lineHeight: 1.1 },
                          }}
                        />
                        {isRtl && noteButton}
                        {!isRtl && checkBox}
                      </Stack>
                    </Stack>
                  </ListItem>
                  <Collapse in={noteEditorOpen}>
                    <Box sx={{ py: 1 }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <AppTextField
                          fullWidth
                          size="small"
                          inputHeight={compactInputHeight}
                          label={t("note")}
                          value={getDraftNoteValue(list._id, item)}
                          onChange={(event) =>
                            onNoteDraftChange(
                              list._id,
                              item._id,
                              event.target.value,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            onSaveNote(list, item);
                            onToggleNoteEditor(list._id, item._id, true);
                          }}
                          disabled={isSavingNote}
                        />
                        <IconButton
                          color="primary"
                          onClick={() => {
                            onSaveNote(list, item);
                            onToggleNoteEditor(list._id, item._id, true);
                          }}
                          aria-label={t("save")}
                          disabled={isSavingNote}
                        >
                          <SaveOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Box>
                  </Collapse>
                  {index < listItems.length - 1 && <Divider />}
                </Box>
              );
            })}
          </List>
          <Box
            sx={{
              mt: 1.25,
              display: "flex",
              direction: "ltr",
              justifyContent: direction === "rtl" ? "flex-start" : "flex-end",
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {t("createdAtLabel")} {formatCreatedAt(list.createdAt)}
            </Typography>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}
