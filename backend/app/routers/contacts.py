"""The signed-in user's address book."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Contact, User
from ..schemas import ContactCreateIn, ContactOut
from ..security import current_user
from ..services.serializers import user_out
from .users import find_user

router = APIRouter(prefix="/contacts", tags=["contacts"])


def contact_out(c: Contact) -> ContactOut:
    return ContactOut(user=user_out(c.contact), nickname=c.nickname, created_at=c.created_at)


@router.get("", response_model=list[ContactOut])
def list_contacts(me: User = Depends(current_user), db: Session = Depends(get_db)):
    contacts = db.scalars(
        select(Contact).where(Contact.owner_id == me.id).options(selectinload(Contact.contact))
    ).all()
    return sorted(
        (contact_out(c) for c in contacts),
        key=lambda c: (c.nickname or c.user.display_name).lower(),
    )


@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
def add_contact(body: ContactCreateIn, me: User = Depends(current_user), db: Session = Depends(get_db)):
    user = find_user(db, body.query)
    if user is None or not user.display_name:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No Signal user found with that number or username")
    if user.id == me.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That's you")
    contact = db.scalar(select(Contact).where(Contact.owner_id == me.id, Contact.contact_id == user.id))
    if contact is None:
        contact = Contact(owner_id=me.id, contact_id=user.id)
        db.add(contact)
    if body.nickname is not None:
        contact.nickname = body.nickname.strip() or None
    db.commit()
    return contact_out(contact)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_contact(user_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    contact = db.scalar(select(Contact).where(Contact.owner_id == me.id, Contact.contact_id == user_id))
    if contact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    db.delete(contact)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
