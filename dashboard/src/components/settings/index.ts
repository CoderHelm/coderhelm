// The shared pieces of a settings page. A page is a stack of
// `SettingsSection`s holding `SettingsRow`s, edited through `useDirtyForm`
// and saved with one `SaveBar`. See reviewer/config and settings/models.
export { SettingsSection } from "./section";
export { SettingsRow, RowMarks, SettingsMore, SettingsDisclosure, type SettingsRowProps, type SettingsRowIds } from "./row";
export { Switch } from "./switch";
export { Field, type FieldProps, type FieldIds } from "./field";
export { SaveBar, type SaveBarProps } from "./save-bar";
export { useDirtyForm, useLeaveWarning, sameSetting, type DirtyForm, type DirtyFormOptions } from "./use-dirty-form";
export { Code } from "./code";
