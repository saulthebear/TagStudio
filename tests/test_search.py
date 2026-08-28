# Copyright (C) 2025
# Licensed under the GPL-3.0 License.
# Created for TagStudio: https://github.com/CyanVoxel/TagStudio


import pytest
import structlog

from tagstudio.core.library.alchemy.enums import BrowsingState
from tagstudio.core.library.alchemy.library import Library
from tagstudio.core.query_lang.util import ParsingError

logger = structlog.get_logger()


def verify_count(lib: Library, query: str, count: int):
    results = lib.search_library(BrowsingState.from_search_query(query), page_size=500)
    logger.info("results", entry_ids=results.ids, count=results.total_count)
    assert results.total_count == count
    assert len(results.ids) == count


@pytest.mark.parametrize(
    ["query", "count"],
    [
        ("", 32),
        ("path:*", 32),
        ("path:*inherit*", 24),
        ("path:*comp*", 5),
        ("special:untagged", 3),
        ("filetype:png", 25),
        ("filetype:jpg", 6),
        ("filetype:'jpg'", 6),
        ("tag_id:1011", 5),
        ("tag_id:1038", 11),
        ("doesnt exist", 0),
        ("archived", 0),
        ("favorite", 0),
        ("tag:favorite", 0),
        ("circle", 11),
        ("tag:square", 11),
        ("green", 5),
        ("orange", 5),
        ("tag:orange", 5),
    ],
)
def test_single_constraint(search_library: Library, query: str, count: int):
    verify_count(search_library, query, count)


@pytest.mark.parametrize(
    ["query", "count"],
    [
        ("circle aND square", 5),
        ("circle square", 5),
        ("green AND square", 2),
        ("green square", 2),
        ("orange AnD square", 2),
        ("orange square", 2),
        ("orange and filetype:png", 5),
        ("square and filetype:jpg", 2),
        ("orange filetype:png", 5),
        ("green path:*inherit*", 4),
    ],
)
def test_and(search_library: Library, query: str, count: int):
    verify_count(search_library, query, count)


@pytest.mark.parametrize(
    ["query", "count"],
    [
        ("square or circle", 17),
        ("orange or green", 10),
        ("orange Or circle", 14),
        ("orange oR square", 14),
        ("square OR green", 14),
        ("circle or green", 14),
        ("green or circle", 14),
        ("filetype:jpg or tag:orange", 11),
        ("red or filetype:png", 28),
        ("filetype:jpg or path:*comp*", 11),
    ],
)
def test_or(search_library: Library, query: str, count: int):
    verify_count(search_library, query, count)


@pytest.mark.parametrize(
    ["query", "count"],
    [
        ("not unexistant", 32),
        ("not path:*", 0),
        ("not not path:*", 32),
        ("not special:untagged", 29),
        ("not filetype:png", 7),
        ("not filetype:jpg", 26),
        ("not tag_id:1011", 27),
        ("not tag_id:1038", 21),
        ("not green", 27),
        ("tag:favorite", 0),
        ("not circle", 21),
        ("not tag:square", 21),
        ("circle and not square", 6),
        ("not circle and square", 6),
        ("special:untagged or not filetype:jpg", 26),
        ("not square or green", 23),
    ],
)
def test_not(search_library: Library, query: str, count: int):
    verify_count(search_library, query, count)


@pytest.mark.parametrize(
    ["query", "count"],
    [
        ("(tag_id:1041)", 11),
        ("(((tag_id:1041)))", 11),
        ("not (not tag_id:1041)", 11),
        ("((circle) and (not square))", 6),
        ("(not ((square) OR (green)))", 18),
        ("filetype:png and (tag:square or green)", 12),
    ],
)
def test_parentheses(search_library: Library, query: str, count: int):
    verify_count(search_library, query, count)


@pytest.mark.parametrize(
    ["query", "count"],
    [
        ("ellipse", 17),
        ("tag_id:1042", 17),
        ("yellow", 15),
        ("color", 25),
        ("tag_id:1040", 25),
        ("shape", 24),
        ("tag_id:1039", 24),
        ("yellow not green", 10),
        ("tag_id:1013 not tag:green", 10),
        ("tag_id:1042 and tag:red", 9),
        ("tag_id:1042 and tag_id:1009", 9),
        ("tag_id:1042 or tag_id:1038", 23),
    ],
)
def test_parent_tags(search_library: Library, query: str, count: int):
    verify_count(search_library, query, count)


@pytest.mark.parametrize(
    "invalid_query", ["asd AND", "asd AND AND", "tag:(", "(asd", "asd[]", "asd]", ":", "tag: :"]
)
def test_syntax(search_library: Library, invalid_query: str):
    with pytest.raises(ParsingError) as e_info:  # noqa: F841  # pyright: ignore[reportUnusedVariable]
        search_library.search_library(BrowsingState.from_search_query(invalid_query), page_size=500)


def test_escaped_single_quotes_tokenizer():
    from tagstudio.core.query_lang.tokenizer import Tokenizer, TokenType

    token = Tokenizer(r"'O\'Brien'").get_next_token()
    assert token.type == TokenType.QLITERAL
    assert token.value == "O'Brien"


def test_empty_or_list_query(search_library: Library):
    # Non-existent tag alongside an existing tag in OR expression evaluates non-existent as false
    verify_count(search_library, "nonexistent_tag_xyz or green", 5)
    verify_count(search_library, "nonexistent_tag_xyz or non_existent_tag_abc", 0)

