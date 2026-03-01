from pathlib import Path
from typing import Any, Protocol

import structlog

from tagstudio.core.constants import TS_FOLDER_NAME
from tagstudio.core.enums import SettingItems
from tagstudio.core.library.alchemy.library import LibraryStatus

logger = structlog.get_logger(__name__)


class CacheStore(Protocol):
    """Minimal cache interface required by DriverMixin."""

    def value(self, key: str) -> Any:
        """Get a value from cache."""

    def setValue(self, key: str, value: Any) -> None:
        """Set a value in cache."""


class DriverSettings(Protocol):
    """Minimal settings interface required by DriverMixin."""

    open_last_loaded_on_startup: bool


class DriverMixin:
    cached_values: CacheStore
    settings: DriverSettings

    def evaluate_path(self, open_path: str | None) -> LibraryStatus:
        """Check if the path of library is valid."""
        library_path: Path | None = None
        if open_path:
            library_path = Path(open_path).expanduser()
            if not library_path.exists():
                logger.error("Path does not exist.", open_path=open_path)
                return LibraryStatus(success=False, message="Path does not exist.")
        elif self.settings.open_last_loaded_on_startup and self.cached_values.value(
            SettingItems.LAST_LIBRARY
        ):
            library_path = Path(str(self.cached_values.value(SettingItems.LAST_LIBRARY)))
            if not (library_path / TS_FOLDER_NAME).exists():
                logger.error(
                    "TagStudio folder does not exist.",
                    library_path=library_path,
                    ts_folder=TS_FOLDER_NAME,
                )
                self.cached_values.setValue(SettingItems.LAST_LIBRARY, "")
                # dont consider this a fatal error, just skip opening the library
                library_path = None

        return LibraryStatus(
            success=True,
            library_path=library_path,
        )
