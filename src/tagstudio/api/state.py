from dataclasses import dataclass, field
from pathlib import Path
from threading import RLock

from tagstudio.core.library.alchemy.library import Library, LibraryStatus


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
