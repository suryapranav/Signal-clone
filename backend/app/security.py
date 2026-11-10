"""Session tokens and the current-user dependency."""

import hashlib
import secrets
from datetime import timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db, utcnow
from .models import AuthSession, User

_bearer = HTTPBearer(auto_error=False)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_session(db: Session, user: User) -> str:
    """Create a session and return the raw token (only the hash is stored)."""
    token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            token_hash=_hash(token),
            user_id=user.id,
            expires_at=utcnow() + timedelta(days=settings.session_days),
        )
    )
    db.commit()
    return token


def revoke_session(db: Session, token: str) -> None:
    session = db.get(AuthSession, _hash(token))
    if session:
        db.delete(session)
        db.commit()


def user_for_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    return db.scalar(
        select(User)
        .join(AuthSession, AuthSession.user_id == User.id)
        .where(AuthSession.token_hash == _hash(token), AuthSession.expires_at > utcnow())
    )


def bearer_token(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    return creds.credentials


def current_user(token: str = Depends(bearer_token), db: Session = Depends(get_db)) -> User:
    user = user_for_token(db, token)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    return user
