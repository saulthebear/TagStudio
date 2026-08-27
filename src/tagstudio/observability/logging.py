from __future__ import annotations

import json
import logging
import re
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

import structlog

from tagstudio.observability.context import get_current_trace_id
from tagstudio.observability.paths import get_telemetry_dirs

_SENSITIVE_KEYS = {"token", "api_token", "password", "secret", "authorization", "x-tagstudio-token"}
_TOKEN_QUERY_PATTERN = re.compile(r"([?&]token=)([^&]+)", re.IGNORECASE)


def redact_sensitive_data(logger: Any, method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    """Redact sensitive fields such as tokens, secrets, and auth headers from log events."""
    for key in list(event_dict.keys()):
        lower_key = key.lower()
        if lower_key in _SENSITIVE_KEYS:
            val = event_dict[key]
            if isinstance(val, str) and len(val) > 4:
                event_dict[key] = f"{val[:4]}...[REDACTED]"
            else:
                event_dict[key] = "[REDACTED]"

    event_msg = event_dict.get("event")
    if isinstance(event_msg, str):
        event_dict["event"] = _TOKEN_QUERY_PATTERN.sub(r"\1[REDACTED]", event_msg)

    return event_dict


def inject_trace_id(logger: Any, method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    """Inject active trace_id from context if not already present."""
    if "trace_id" not in event_dict:
        trace_id = get_current_trace_id()
        if trace_id:
            event_dict["trace_id"] = trace_id
    return event_dict


class JsonlFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        if isinstance(record.msg, dict):
            payload = record.msg
        else:
            payload = {
                "event": record.getMessage(),
                "logger": record.name,
                "level": record.levelname.lower(),
                "timestamp": self.formatTime(record, self.datefmt),
            }
            if record.exc_info:
                payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False)


_logging_configured = False


def configure_logging(library_dir: Path | None = None, log_level: str = "INFO") -> tuple[Path, Path]:
    """Configure structlog and standard logging with console, text log, and JSONL log sinks.

    Returns the paths to (text_log_file, jsonl_log_file).
    """
    global _logging_configured

    logs_dir, _ = get_telemetry_dirs(library_dir)
    text_log_path = logs_dir / "tagstudio.log"
    jsonl_log_path = logs_dir / "tagstudio.jsonl"

    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Remove existing tagstudio file handlers if re-configuring for a new library
    for handler in list(root_logger.handlers):
        if getattr(handler, "_tagstudio_telemetry", False):
            root_logger.removeHandler(handler)
            handler.close()

    # 1. Text file handler (human-readable)
    text_handler = RotatingFileHandler(
        text_log_path,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    text_handler.setLevel(numeric_level)
    text_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s", datefmt="%Y-%m-%dT%H:%M:%SZ")
    )
    setattr(text_handler, "_tagstudio_telemetry", True)
    root_logger.addHandler(text_handler)

    # 2. JSONL file handler (structured)
    jsonl_handler = RotatingFileHandler(
        jsonl_log_path,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    jsonl_handler.setLevel(numeric_level)
    jsonl_handler.setFormatter(JsonlFormatter())
    setattr(jsonl_handler, "_tagstudio_telemetry", True)
    root_logger.addHandler(jsonl_handler)

    # 3. Console handler (if not already present)
    has_console = any(
        isinstance(h, logging.StreamHandler) and not getattr(h, "_tagstudio_telemetry", False)
        for h in root_logger.handlers
    )
    if not has_console:
        console_handler = logging.StreamHandler()
        console_handler.setLevel(numeric_level)
        console_handler.setFormatter(logging.Formatter("[%(levelname)s] %(name)s: %(message)s"))
        root_logger.addHandler(console_handler)

    if not _logging_configured:
        structlog.configure(
            processors=[
                structlog.contextvars.merge_contextvars,
                structlog.stdlib.add_logger_name,
                structlog.stdlib.add_log_level,
                structlog.stdlib.PositionalArgumentsFormatter(),
                inject_trace_id,
                redact_sensitive_data,
                structlog.processors.TimeStamper(fmt="iso", utc=True),
                structlog.processors.StackInfoRenderer(),
                structlog.processors.format_exc_info,
                structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
            ],
            logger_factory=structlog.stdlib.LoggerFactory(),
            wrapper_class=structlog.stdlib.BoundLogger,
            cache_logger_on_first_use=True,
        )
        _logging_configured = True

    return text_log_path, jsonl_log_path
