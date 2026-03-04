---
icon: material/clipboard-check
---

# :material-clipboard-check: Qt Parity Baseline (Phase 0)

This baseline maps the current Qt implementation to migration target workflows.

## Library Lifecycle

- Open library dialog: `QtDriver.open_library_from_dialog`
- Open specific library: `QtDriver.open_library`
- Close library: `QtDriver.close_library`
- Backup library: `QtDriver.backup_library`
- Recent libraries: `QtDriver.update_recent_lib_menu`, `QtDriver.update_libs_list`

## Browsing and Search

- Browsing state updates: `QtDriver.update_browsing_state`
- Sorting controls: `QtDriver.sorting_mode_callback`, `QtDriver.sorting_direction_callback`
- Hidden entries toggle: `QtDriver.show_hidden_entries_callback`
- Paging/navigation: `QtDriver.page_move`, `QtDriver.navigation_callback`
- Search completion list: `QtDriver.update_completions_list`

## Entry Operations

- Select operations: `QtDriver.select_all_action_callback`, `QtDriver.clear_select_action_callback`
- Add tags to selected entries: `QtDriver.add_tags_to_selected_callback`
- Delete files/entries: `QtDriver.delete_files_callback`
- Copy/paste fields: `QtDriver.copy_fields_action_callback`, `QtDriver.paste_fields_action_callback`

## Refresh and Background Work

- Refresh trigger: `QtDriver.add_new_files_callback`
- Refresh worker: `QtDriver.add_new_files_runnable`
- Macro execution hooks: `QtDriver.run_macros`, `QtDriver.run_macro`

## UI/Settings/Feedback

- Thumbnail updates: `QtDriver.update_thumbs`
- Badge updates: `QtDriver.update_badges`
- Settings modal: `QtDriver.open_settings_modal`
- Error reporting: `QtDriver.show_error_message`

## Migration Acceptance Snapshot

Daily workflow parity is considered met when the web frontend implements equivalent
user outcomes for all sections above using the API-driven architecture.
