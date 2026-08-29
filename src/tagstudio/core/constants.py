# Copyright (C) 2025
# Licensed under the GPL-3.0 License.
# Created for TagStudio: https://github.com/CyanVoxel/TagStudio

VERSION: str = "9.5.6"  # Major.Minor.Patch
VERSION_BRANCH: str = ""  # Usually "" or "Pre-Release"

# The folder & file names where TagStudio keeps its data relative to a library.
TS_FOLDER_NAME: str = ".TagStudio"
BACKUP_FOLDER_NAME: str = "backups"
COLLAGE_FOLDER_NAME: str = "collages"
IGNORE_NAME: str = ".ts_ignore"
THUMB_CACHE_NAME: str = "thumbs"

TAG_ARCHIVED = 0
TAG_FAVORITE = 1
TAG_META = 2
RESERVED_TAG_START = 0
RESERVED_TAG_END = 999

RESERVED_NAMESPACE_PREFIX = "tagstudio"
