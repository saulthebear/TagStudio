import json
import os
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from threading import RLock
from typing import Any

from tagstudio.core.library.alchemy.library import Library, LibraryStatus
from tagstudio.core.media.thumbnail_pipeline import ThumbnailPipeline


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


DEFAULT_THUMBNAIL_SETTINGS: dict[str, int] = {
    "cache_max_mib": _env_int("TAGSTUDIO_API_THUMB_CACHE_MAX_MIB", 512),
    "grid_size": _env_int("TAGSTUDIO_API_THUMB_GRID_SIZE", 256),
    "preview_size": _env_int("TAGSTUDIO_API_THUMB_PREVIEW_SIZE", 768),
    "quality": _env_int("TAGSTUDIO_API_THUMB_QUALITY", 80),
}

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
    "thumbnails": DEFAULT_THUMBNAIL_SETTINGS,
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


def _clamp_int(value: Any, *, default: int, low: int, high: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, parsed))


@dataclass
class ApiState:
    """Runtime state container for the API process."""

    token: str | None = None
    library: Library | None = None
    library_path: Path | None = None
    thumbnail_pipeline: ThumbnailPipeline | None = None
    lock: RLock = field(default_factory=RLock)

    def close_library(self) -> None:
        with self.lock:
            if self.library is not None:
                self.library.close()
            if self.thumbnail_pipeline is not None:
                self.thumbnail_pipeline.close()
            self.library = None
            self.library_path = None
            self.thumbnail_pipeline = None

    def open_library(self, library_path: Path) -> LibraryStatus:
        with self.lock:
            lib = Library()
            status = lib.open_library(library_path)
            if status.success:
                if self.library is not None:
                    self.library.close()
                if self.thumbnail_pipeline is not None:
                    self.thumbnail_pipeline.close()
                self.library = lib
                self.library_path = library_path
                settings = self.get_web_settings()
                thumbs = settings["thumbnails"]
                self.thumbnail_pipeline = ThumbnailPipeline(
                    library_dir=library_path,
                    cache_max_mib=int(thumbs["cache_max_mib"]),
                    grid_size=int(thumbs["grid_size"]),
                    preview_size=int(thumbs["preview_size"]),
                    quality=int(thumbs["quality"]),
                )
            else:
                lib.close()
            return status

    def create_library(self, library_path: Path) -> LibraryStatus:
        library_path.mkdir(parents=True, exist_ok=True)
        return self.open_library(library_path)

    def get_library(self) -> Library | None:
        with self.lock:
            return self.library

    def get_thumbnail_pipeline(self) -> ThumbnailPipeline | None:
        with self.lock:
            return self.thumbnail_pipeline

    def _settings_path(self) -> Path | None:
        if self.library_path is None:
            return None
        return self.library_path / ".TagStudio" / "web_settings.json"

    def get_web_settings(self) -> dict[str, Any]:
        with self.lock:
            settings = deepcopy(DEFAULT_WEB_SETTINGS)
            settings_path = self._settings_path()
            if settings_path is None or not settings_path.exists():
                return self._normalize_web_settings(settings)

            try:
                loaded = json.loads(settings_path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    filtered_loaded = {
                        key: value for key, value in loaded.items() if key in settings
                    }
                    settings = _deep_merge(settings, filtered_loaded)
            except Exception:
                return self._normalize_web_settings(settings)

            return self._normalize_web_settings(settings)

    def update_web_settings(self, updates: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            settings = self.get_web_settings()
            settings = _deep_merge(settings, updates)
            settings = self._normalize_web_settings(settings)
            settings_path = self._settings_path()
            if settings_path is not None:
                settings_path.parent.mkdir(parents=True, exist_ok=True)
                settings_path.write_text(json.dumps(settings, indent=2), encoding="utf-8")
            if self.thumbnail_pipeline is not None:
                thumbs = settings["thumbnails"]
                self.thumbnail_pipeline.update_config(
                    cache_max_mib=int(thumbs["cache_max_mib"]),
                    grid_size=int(thumbs["grid_size"]),
                    preview_size=int(thumbs["preview_size"]),
                    quality=int(thumbs["quality"]),
                )
            return settings

    def _normalize_web_settings(self, settings: dict[str, Any]) -> dict[str, Any]:
        """Apply type normalization and value clamping to persisted web settings."""
        settings = deepcopy(settings)
        settings["page_size"] = _clamp_int(settings.get("page_size"), default=200, low=1, high=2000)
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
        layout["inspector_split_ratio"] = _clamp_ratio(layout.get("inspector_split_ratio"), 0.52)
        layout["preview_collapsed"] = bool(layout.get("preview_collapsed", False))
        layout["metadata_collapsed"] = bool(layout.get("metadata_collapsed", False))
        layout["inspector_last_open_ratio"] = _clamp_ratio(
            layout.get("inspector_last_open_ratio"),
            0.52,
        )
        mobile_active_pane = str(layout.get("mobile_active_pane", "grid"))
        if mobile_active_pane not in {"grid", "preview", "metadata"}:
            mobile_active_pane = "grid"
        layout["mobile_active_pane"] = mobile_active_pane

        if layout["main_left_collapsed"] and layout["main_right_collapsed"]:
            layout["main_right_collapsed"] = False
        if layout["preview_collapsed"] and layout["metadata_collapsed"]:
            layout["metadata_collapsed"] = False

        thumbs = settings.get("thumbnails")
        if not isinstance(thumbs, dict):
            thumbs = deepcopy(DEFAULT_THUMBNAIL_SETTINGS)
        thumbs["cache_max_mib"] = _clamp_int(
            thumbs.get("cache_max_mib"),
            default=DEFAULT_THUMBNAIL_SETTINGS["cache_max_mib"],
            low=64,
            high=16384,
        )
        thumbs["grid_size"] = _clamp_int(
            thumbs.get("grid_size"),
            default=DEFAULT_THUMBNAIL_SETTINGS["grid_size"],
            low=32,
            high=2048,
        )
        thumbs["preview_size"] = _clamp_int(
            thumbs.get("preview_size"),
            default=DEFAULT_THUMBNAIL_SETTINGS["preview_size"],
            low=32,
            high=2048,
        )
        thumbs["quality"] = _clamp_int(
            thumbs.get("quality"),
            default=DEFAULT_THUMBNAIL_SETTINGS["quality"],
            low=1,
            high=100,
        )

        settings["layout"] = layout
        settings["thumbnails"] = thumbs
        return settings
