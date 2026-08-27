from __future__ import annotations

import contextvars
from collections.abc import Generator
from contextlib import contextmanager

trace_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("trace_id", default=None)


def get_current_trace_id() -> str | None:
    """Get the active trace ID from the current context."""
    return trace_id_var.get()


def set_current_trace_id(trace_id: str | None) -> contextvars.Token[str | None]:
    """Set the active trace ID for the current context."""
    return trace_id_var.set(trace_id)


@contextmanager
def trace_scope(trace_id: str | None) -> Generator[None]:
    """Context manager to execute a code block under a specific trace ID."""
    token = set_current_trace_id(trace_id)
    try:
        yield
    finally:
        trace_id_var.reset(token)
