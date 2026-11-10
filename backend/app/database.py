"""SQLAlchemy engine, session factory and declarative base.

Runs on SQLite (local development, tests, zero-config demo) or Postgres
(production, so data survives restarts), chosen by DATABASE_URL.
"""

from collections.abc import Iterator
from datetime import datetime, timezone

import logging

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


def normalize_url(url: str) -> str:
    """Hosts like Neon and Render hand out `postgres://…` / `postgresql://…`;
    SQLAlchemy needs the driver named explicitly (psycopg 3)."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = normalize_url(settings.database_url)
IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    # SQLite: FastAPI may touch a session from a worker thread and the event
    # loop thread during one request, so the same-thread check is disabled.
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
    # Postgres: hosted databases close idle connections; check before use.
    pool_pre_ping=not IS_SQLITE,
)

if IS_SQLITE:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record) -> None:
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")  # SQLite ignores FKs unless asked
        cur.execute("PRAGMA journal_mode=WAL")  # readers don't block the writer
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def add_missing_columns() -> None:
    """A minimal migration step for a schema that only grows: `create_all`
    creates missing tables but never alters existing ones, so add any new
    nullable column a table is missing (e.g. messages.edited_at on a database
    created before that feature). Anything bigger would need Alembic."""
    insp = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            existing = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in existing:
                    continue
                if not col.nullable:
                    logging.getLogger("signal").warning("can't add NOT NULL column %s.%s", table.name, col.name)
                    continue
                col_type = col.type.compile(dialect=engine.dialect)
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type}'))


def utcnow() -> datetime:
    """Naive UTC timestamp. Columns hold UTC without a zone (SQLite has no
    timezone type), and the API serialises them with a trailing 'Z'."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
