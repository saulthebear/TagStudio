# Copyright (C) 2025 Travis Abendshien (CyanVoxel).
# Licensed under the GPL-3.0 License.
# Created for TagStudio: https://github.com/CyanVoxel/TagStudio


import shutil
from pathlib import Path

import pytest
from sqlalchemy import text

from tagstudio.core.constants import TS_FOLDER_NAME
from tagstudio.core.library.alchemy.constants import (
    SQL_FILENAME,
)
from tagstudio.core.library.alchemy.library import Library

CWD = Path(__file__)
FIXTURES = "fixtures"
EMPTY_LIBRARIES = "empty_libraries"


@pytest.mark.parametrize(
    "path",
    [
        str(Path(CWD.parent / FIXTURES / EMPTY_LIBRARIES / "DB_VERSION_6")),
        str(Path(CWD.parent / FIXTURES / EMPTY_LIBRARIES / "DB_VERSION_7")),
        str(Path(CWD.parent / FIXTURES / EMPTY_LIBRARIES / "DB_VERSION_8")),
        str(Path(CWD.parent / FIXTURES / EMPTY_LIBRARIES / "DB_VERSION_9")),
        str(Path(CWD.parent / FIXTURES / EMPTY_LIBRARIES / "DB_VERSION_100")),
    ],
)
def test_library_migrations(path: str):
    library = Library()

    # Copy libraries to temp dir so modifications don't show up in version control
    original_path = Path(path)
    temp_path = Path(CWD.parent / FIXTURES / EMPTY_LIBRARIES / "DB_VERSION_TEMP")
    temp_path.mkdir(exist_ok=True)
    temp_path_ts = temp_path / TS_FOLDER_NAME
    temp_path_ts.mkdir(exist_ok=True)
    shutil.copy(
        original_path / TS_FOLDER_NAME / SQL_FILENAME,
        temp_path / TS_FOLDER_NAME / SQL_FILENAME,
    )

    try:
        status = library.open_library(library_dir=temp_path)
        assert library.engine is not None
        with library.engine.connect() as connection:
            indexes = connection.execute(text("PRAGMA index_list('entries')")).fetchall()
            assert any(index[1] == "ix_entries_date_added" for index in indexes)

            tag_columns = connection.execute(text("PRAGMA table_info('tags')")).fetchall()
            assert any(col[1] == "tag_type" for col in tag_columns)

            tag_indexes = connection.execute(text("PRAGMA index_list('tags')")).fetchall()
            assert any(idx[1] == "ix_tags_tag_type" for idx in tag_indexes)

        # Verify default tags migrated to meta type
        archived_tag = library.get_tag(0)
        if archived_tag is not None:
            assert archived_tag.tag_type == "meta"

        favorite_tag = library.get_tag(1)
        if favorite_tag is not None:
            assert favorite_tag.tag_type == "meta"
        library.close()
        shutil.rmtree(temp_path)
        assert status.success
    except Exception as e:
        library.close()
        shutil.rmtree(temp_path)
        raise (e)
