from __future__ import annotations

from collections import OrderedDict


class DepthCache:
    def __init__(self, max_items: int = 16) -> None:
        self.max_items = max_items
        self._items: OrderedDict[str, object] = OrderedDict()

    def get(self, key: str) -> object | None:
        value = self._items.get(key)
        if value is None:
            return None
        self._items.move_to_end(key)
        return value

    def set(self, key: str, value: object) -> None:
        self._items[key] = value
        self._items.move_to_end(key)
        while len(self._items) > self.max_items:
            self._items.popitem(last=False)
