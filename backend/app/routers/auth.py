"""Mocked phone registration: request a code, verify it, get a session token."""

import random

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import AVATAR_COLORS, Conversation, ConversationMember, User
from ..schemas import AuthOut, OtpRequestIn, OtpRequestOut, VerifyOtpIn
from ..security import bearer_token, issue_session, revoke_session
from ..services.conversations import direct_key
from ..services.serializers import user_out

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-otp", response_model=OtpRequestOut)
def request_otp(body: OtpRequestIn, db: Session = Depends(get_db)):
    """Pretend to text a verification code. The fixed code is returned so the
    UI can show it, since no SMS is actually sent."""
    registered = db.scalar(select(User.id).where(User.phone == body.phone)) is not None
    return OtpRequestOut(phone=body.phone, registered=registered, otp_hint=settings.fixed_otp)


@router.post("/verify-otp", response_model=AuthOut)
def verify_otp(body: VerifyOtpIn, db: Session = Depends(get_db)):
    if body.code != settings.fixed_otp:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect code. Try again.")

    user = db.scalar(select(User).where(User.phone == body.phone))
    if user is None:
        user = User(phone=body.phone, avatar_color=random.choice(AVATAR_COLORS))
        db.add(user)
        db.flush()
        # Every account starts with a "Note to Self" chat, as in Signal.
        note = Conversation(kind="direct", direct_key=direct_key(user.id, user.id), created_by=user.id)
        note.members = [ConversationMember(user_id=user.id)]
        db.add(note)
        db.commit()

    token = issue_session(db, user)
    return AuthOut(token=token, user=user_out(user), needs_profile=not user.display_name)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(token: str = Depends(bearer_token), db: Session = Depends(get_db)):
    revoke_session(db, token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
