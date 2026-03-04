"""Core localization helpers.

This module keeps the core layer independent of any frontend-specific translation
system (Qt, web, CLI, etc.).
"""

from collections.abc import Callable

_DEFAULT_STRINGS = {
    "status.library_version_mismatch": "Library version mismatch.",
    "status.library_version_found": "Found",
    "status.library_version_expected": "Expected",
}

_translation_getter: Callable[[str], str] | None = None


def set_translation_getter(getter: Callable[[str], str] | None) -> None:
    """Set or reset the translation getter used by core."""
    global _translation_getter
    _translation_getter = getter


def tr(key: str, fallback: str | None = None) -> str:
    """Translate key using current getter, falling back to core defaults."""
    if _translation_getter is not None:
        value = _translation_getter(key)
        if value and value != f"[{key}]":
            return value

    if fallback is not None:
        return fallback

    return _DEFAULT_STRINGS.get(key, key)
