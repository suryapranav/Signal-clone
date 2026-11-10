"""In-memory registry of open WebSocket connections.

Each user can have several sockets open (several tabs or devices). Everything
the server pushes goes through `manager.send_to_users`, which returns the users
that actually received the event. Message delivery receipts rely on that.

This registry lives in process memory, so the backend must run as a single
instance. Scaling out would mean replacing it with a pub/sub layer such as
Redis, keeping the same interface.
"""

import logging
from collections import defaultdict
from collections.abc import Iterable

from fastapi import WebSocket

log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._sockets: dict[int, set[WebSocket]] = defaultdict(set)

    def connect(self, user_id: int, ws: WebSocket) -> bool:
        """Register a socket. Returns True if the user just came online."""
        first = not self._sockets[user_id]
        self._sockets[user_id].add(ws)
        return first

    def disconnect(self, user_id: int, ws: WebSocket) -> bool:
        """Unregister a socket. Returns True if the user just went offline."""
        sockets = self._sockets.get(user_id)
        if not sockets:
            return False
        sockets.discard(ws)
        if not sockets:
            del self._sockets[user_id]
            return True
        return False

    def is_online(self, user_id: int) -> bool:
        return bool(self._sockets.get(user_id))

    async def send_to_user(self, user_id: int, event: dict) -> bool:
        delivered = False
        for ws in list(self._sockets.get(user_id, ())):
            try:
                await ws.send_json(event)
                delivered = True
            except Exception:  # socket closed mid-send; the WS loop cleans up
                log.debug("drop event for user %s", user_id, exc_info=True)
        return delivered

    async def send_to_users(self, user_ids: Iterable[int], event: dict) -> set[int]:
        return {uid for uid in set(user_ids) if await self.send_to_user(uid, event)}


manager = ConnectionManager()
