"""The signed-in user's profile, and looking people up."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import User
from ..schemas import ProfileUpdateIn, UserOut, normalize_phone
from ..security import current_user
from ..services.messaging import publish_user
from ..services.serializers import user_out

router = APIRouter(prefix="/users", tags=["users"])


def find_user(db: Session, query: str) -> User | None:
    """Exact match on phone number or username, like Signal's "Find by…"."""
    query = query.strip()
    try:
        return db.scalar(select(User).where(User.phone == normalize_phone(query)))
    except ValueError:
        return db.scalar(select(User).where(User.username == query.lower().lstrip("@")))


@router.get("/me", response_model=UserOut)
def get_me(me: User = Depends(current_user)):
    return user_out(me)


@router.patch("/me", response_model=UserOut)
async def update_me(body: ProfileUpdateIn, me: User = Depends(current_user), db: Session = Depends(get_db)):
    changes = body.model_dump(exclude_unset=True)
    if "avatar_url" in changes:
        if changes["avatar_url"] and len(changes["avatar_url"]) > settings.max_avatar_bytes:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Photo is too large")
        changes["avatar_url"] = changes["avatar_url"] or None
    if "username" in changes:
        changes["username"] = changes["username"] or None
        taken = changes["username"] and db.scalar(
            select(User.id).where(User.username == changes["username"], User.id != me.id)
        )
        if taken:
            raise HTTPException(status.HTTP_409_CONFLICT, "That username is taken")
    for field, value in changes.items():
        setattr(me, field, value)
    db.commit()
    await publish_user(db, me)
    return user_out(me)


@router.get("/lookup", response_model=UserOut)
def lookup(q: str = Query(min_length=3), me: User = Depends(current_user), db: Session = Depends(get_db)):
    user = find_user(db, q)
    if user is None or not user.display_name:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No Signal user found")
    return user_out(user)
