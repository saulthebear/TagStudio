import re
from pathlib import Path


def test_core_module_has_no_qt_or_pyside_imports(cwd: Path):
    core_dir = cwd.parent / "src" / "tagstudio" / "core"
    import_pattern = re.compile(r"\b(from|import)\s+(tagstudio\.qt|PySide6)\b")

    violations: list[str] = []
    for py_file in core_dir.rglob("*.py"):
        content = py_file.read_text(encoding="utf-8")
        if import_pattern.search(content):
            violations.append(str(py_file.relative_to(cwd.parent)))

    assert violations == []
