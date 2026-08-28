# Copyright (C) 2025
# Licensed under the GPL-3.0 License.
# Created for TagStudio: https://github.com/CyanVoxel/TagStudio

from tagstudio.core.library.alchemy.enums import BrowsingState, SortingModeEnum
from tagstudio.core.library.alchemy.library import Library


def test_browsing_state_random_seed_initialization() -> None:
    # Starting directly with RANDOM sorting mode assigns a non-zero random seed
    state = BrowsingState(sorting_mode=SortingModeEnum.RANDOM)
    assert state.random_seed >= 0.1
    assert state.random_seed <= 100.0

    # Switching to RANDOM mode assigns a non-zero random seed
    base_state = BrowsingState(sorting_mode=SortingModeEnum.DATE_ADDED)
    switched = base_state.with_sorting_mode(SortingModeEnum.RANDOM)
    assert switched.random_seed >= 0.1
    assert switched.random_seed <= 100.0

    # Explicit non-zero seed is preserved
    explicit_state = BrowsingState(sorting_mode=SortingModeEnum.RANDOM, random_seed=42.5)
    assert explicit_state.random_seed == 42.5


def test_random_sorting_order_variation(search_library: Library) -> None:
    # When random sort is performed across different sessions/seeds, ordering is not sequential ID order
    results_a = search_library.search_library(
        BrowsingState(sorting_mode=SortingModeEnum.RANDOM), page_size=100
    )
    results_b = search_library.search_library(
        BrowsingState(sorting_mode=SortingModeEnum.RANDOM), page_size=100
    )

    assert len(results_a.ids) > 1
    # Sorted by ID would be list(sorted(results_a.ids))
    sequential_ids = sorted(results_a.ids)
    assert results_a.ids != sequential_ids, "Random search should not return simple sequential IDs"

    # Deterministic with identical seed
    seeded_a = search_library.search_library(
        BrowsingState(sorting_mode=SortingModeEnum.RANDOM, random_seed=12.34), page_size=100
    )
    seeded_b = search_library.search_library(
        BrowsingState(sorting_mode=SortingModeEnum.RANDOM, random_seed=12.34), page_size=100
    )
    assert seeded_a.ids == seeded_b.ids
