"""SQLAlchemy engine, session factory and declarative base."""

from collections.abc import Iterator
from datetime import datetime, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

engine = create_engine(
    settings.database_url,
    # FastAPI may touch a session from a worker thread and the event loop
    # thread during one request, so SQLite's same-thread check is disabled.
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record) -> None:
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")  # SQLite ignores FKs unless asked
    cur.execute("PRAGMA journal_mode=WAL")  # readers don't block the writer
    cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    """Naive UTC timestamp. SQLite has no timezone type, so everything in the
    database is UTC and is serialised with a trailing 'Z' (see schemas.py)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
