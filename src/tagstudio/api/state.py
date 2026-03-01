from dataclasses import dataclass, field
import json
from pathlib import Path
from threading import RLock
from typing import Any

from tagstudio.core.library.alchemy.library import Library, LibraryStatus

DEFAULT_WEB_SETTINGS: dict[str, Any] = {
    "sorting_mode": "file.date_added",
    "ascending": True,
    "show_hidden_entries": False,
    "page_size": 200,
}


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
            settings = DEFAULT_WEB_SETTINGS.copy()
            settings_path = self._settings_path()
            if settings_path is None or not settings_path.exists():
                return settings

            try:
                loaded = json.loads(settings_path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    for key, value in loaded.items():
                        if key in settings:
                            settings[key] = value
            except Exception:
                return settings

            settings["page_size"] = max(1, min(2000, int(settings.get("page_size", 200))))
            settings["ascending"] = bool(settings.get("ascending", True))
            settings["show_hidden_entries"] = bool(settings.get("show_hidden_entries", False))
            settings["sorting_mode"] = str(settings.get("sorting_mode", "file.date_added"))
            return settings

    def update_web_settings(self, updates: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            settings = self.get_web_settings()
            settings.update(updates)
            settings["page_size"] = max(1, min(2000, int(settings.get("page_size", 200))))
            settings_path = self._settings_path()
            if settings_path is not None:
                settings_path.parent.mkdir(parents=True, exist_ok=True)
                settings_path.write_text(json.dumps(settings, indent=2), encoding="utf-8")
            return settings
