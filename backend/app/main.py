"""FastAPI application: wiring, startup and background jobs."""

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, SessionLocal, engine
from .routers import auth, contacts, conversations, messages, users, ws
from .seed import seed_if_empty
from .services.messaging import purge_expired

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("signal")


async def _purge_loop() -> None:
    """Delete disappearing messages once they expire and tell clients."""
    while True:
        await asyncio.sleep(settings.purge_interval_seconds)
        try:
            with SessionLocal() as db:
                if n := await purge_expired(db):
                    log.info("purged %d expired messages", n)
        except Exception:
            log.exception("purge failed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(engine)
    if settings.seed_on_startup:
        with SessionLocal() as db:
            seed_if_empty(db)
    task = asyncio.create_task(_purge_loop())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


app = FastAPI(title="Signal Clone API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, users, contacts, conversations, messages):
    app.include_router(r.router, prefix="/api")
app.include_router(ws.router)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}
