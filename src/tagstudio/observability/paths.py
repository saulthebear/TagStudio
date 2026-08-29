from __future__ import annotations

import os
import sys
from pathlib import Path

from tagstudio.core.constants import TS_FOLDER_NAME


def get_default_app_data_dir() -> Path:
    """Return the platform-appropriate application data directory for TagStudio."""
    override = os.environ.get("TAGSTUDIO_APP_DATA_DIR")
    if override:
        base = Path(override).expanduser().resolve()
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "TagStudio"
    elif sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        base = (
            Path(appdata) / "TagStudio"
            if appdata
            else Path.home() / "AppData" / "Roaming" / "TagStudio"
        )
    else:
        xdg_data_home = os.environ.get("XDG_DATA_HOME")
        base = (
            Path(xdg_data_home) / "tagstudio"
            if xdg_data_home
            else Path.home() / ".local" / "share" / "tagstudio"
        )

    base.mkdir(parents=True, exist_ok=True)
    return base


def get_telemetry_dirs(library_dir: Path | None = None) -> tuple[Path, Path]:
    """Return (logs_dir, metrics_dir) for either the given library or the global app data dir."""
    base = library_dir / TS_FOLDER_NAME if library_dir is not None else get_default_app_data_dir()

    logs_dir = base / "logs"
    metrics_dir = base / "metrics"

    logs_dir.mkdir(parents=True, exist_ok=True)
    metrics_dir.mkdir(parents=True, exist_ok=True)

    return logs_dir, metrics_dir
