import json
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from threading import RLock
from typing import Any

from tagstudio.core.library.alchemy.library import Library, LibraryStatus

DEFAULT_WEB_SETTINGS: dict[str, Any] = {
    "sorting_mode": "file.date_added",
    "ascending": True,
    "show_hidden_entries": False,
    "page_size": 200,
    "layout": {
        "main_split_ratio": 0.78,
        "main_left_collapsed": False,
        "main_right_collapsed": False,
        "main_last_open_ratio": 0.78,
        "inspector_split_ratio": 0.52,
        "preview_collapsed": False,
        "metadata_collapsed": False,
        "inspector_last_open_ratio": 0.52,
        "mobile_active_pane": "grid",
    },
}


def _deep_merge(base: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base)
    for key, value in updates.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _clamp_ratio(value: Any, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.1, min(0.9, parsed))


@dataclass
class ApiState:
    """Runtime state container for the API process."""

    token: str | None = None
    library: Library | None = None
    library_path: Path | None = None
    lock: RLock = field(default_factory=RLock)

    def close_library(self) -> None:
        with self.lock:
            if self.library is not None:
                self.library.close()
            self.library = None
            self.library_path = None

    def open_library(self, library_path: Path) -> LibraryStatus:
        with self.lock:
            lib = Library()
            status = lib.open_library(library_path)
            if status.success:
                if self.library is not None:
                    self.library.close()
                self.library = lib
                self.library_path = library_path
            else:
                lib.close()
            return status

    def create_library(self, library_path: Path) -> LibraryStatus:
        library_path.mkdir(parents=True, exist_ok=True)
        return self.open_library(library_path)

    def get_library(self) -> Library | None:
        with self.lock:
            return self.library

    def _settings_path(self) -> Path | None:
        if self.library_path is None:
            return None
        return self.library_path / ".TagStudio" / "web_settings.json"

    def get_web_settings(self) -> dict[str, Any]:
        with self.lock:
            settings = deepcopy(DEFAULT_WEB_SETTINGS)
            settings_path = self._settings_path()
            if settings_path is None or not settings_path.exists():
                return settings

            try:
                loaded = json.loads(settings_path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    filtered_loaded = {
                        key: value for key, value in loaded.items() if key in settings
                    }
                    settings = _deep_merge(settings, filtered_loaded)
            except Exception:
                return settings

            settings["page_size"] = max(1, min(2000, int(settings.get("page_size", 200))))
            settings["ascending"] = bool(settings.get("ascending", True))
            settings["show_hidden_entries"] = bool(settings.get("show_hidden_entries", False))
            settings["sorting_mode"] = str(settings.get("sorting_mode", "file.date_added"))
            layout = settings.get("layout")
            if not isinstance(layout, dict):
                layout = deepcopy(DEFAULT_WEB_SETTINGS["layout"])

            layout["main_split_ratio"] = _clamp_ratio(layout.get("main_split_ratio"), 0.78)
            layout["main_left_collapsed"] = bool(layout.get("main_left_collapsed", False))
            layout["main_right_collapsed"] = bool(layout.get("main_right_collapsed", False))
            layout["main_last_open_ratio"] = _clamp_ratio(layout.get("main_last_open_ratio"), 0.78)
            layout["inspector_split_ratio"] = _clamp_ratio(
                layout.get("inspector_split_ratio"), 0.52
            )
            layout["preview_collapsed"] = bool(layout.get("preview_collapsed", False))
            layout["metadata_collapsed"] = bool(layout.get("metadata_collapsed", False))
            layout["inspector_last_open_ratio"] = _clamp_ratio(
                layout.get("inspector_last_open_ratio"), 0.52
            )
            mobile_active_pane = str(layout.get("mobile_active_pane", "grid"))
            if mobile_active_pane not in {"grid", "preview", "metadata"}:
                mobile_active_pane = "grid"
            layout["mobile_active_pane"] = mobile_active_pane

            # Guardrail: disallow both sides collapsed in same split.
            if layout["main_left_collapsed"] and layout["main_right_collapsed"]:
                layout["main_right_collapsed"] = False
            if layout["preview_collapsed"] and layout["metadata_collapsed"]:
                layout["metadata_collapsed"] = False

            settings["layout"] = layout
            return settings

    def update_web_settings(self, updates: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            settings = self.get_web_settings()
            settings = _deep_merge(settings, updates)
            settings["page_size"] = max(1, min(2000, int(settings.get("page_size", 200))))
            settings_path = self._settings_path()
            if settings_path is not None:
                settings_path.parent.mkdir(parents=True, exist_ok=True)
                settings_path.write_text(json.dumps(settings, indent=2), encoding="utf-8")
            return settings
