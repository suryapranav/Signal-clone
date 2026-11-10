"""Runtime configuration, read once from environment variables."""

import os


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes"}


class Settings:
    # SQLite file path. On free hosting tiers the disk is ephemeral, so the
    # database is re-created and re-seeded on every boot (see main.lifespan).
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./signal.db")

    # Comma-separated list of allowed frontend origins.
    cors_origins: list[str] = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
        if o.strip()
    ]
    # Also allow any Vercel preview deployment of the frontend.
    cors_origin_regex: str | None = os.getenv("CORS_ORIGIN_REGEX", r"https://.*\.vercel\.app")

    # Phone verification is mocked: every number accepts this code.
    fixed_otp: str = os.getenv("FIXED_OTP", "123456")

    session_days: int = int(os.getenv("SESSION_DAYS", "30"))
    seed_on_startup: bool = _bool("SEED_ON_STARTUP", True)

    # How often the background job deletes expired disappearing messages.
    purge_interval_seconds: int = int(os.getenv("PURGE_INTERVAL_SECONDS", "10"))

    # Profile pictures are stored inline as data URLs; cap their size.
    max_avatar_bytes: int = 400_000


settings = Settings()
