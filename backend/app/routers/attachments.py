"""File attachments: upload first, then reference the id when sending a message.

Downloads use an unguessable random key in the URL instead of the bearer
token, because <img> tags can't send Authorization headers. That's the same
idea as an S3 presigned URL: whoever has the link (i.e. the chat members who
received the message) can fetch the file.
"""

import re
import secrets
from urllib.parse import quote

from fastapi import APIRouter, Depends, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Attachment, User
from ..schemas import AttachmentOut
from ..security import current_user
from ..services.serializers import IMAGE_TYPES, attachment_out

router = APIRouter(prefix="/attachments", tags=["attachments"])

MAX_BYTES = 5 * 1024 * 1024


def _clean_filename(name: str | None) -> str:
    name = (name or "file").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f]", "", name).strip() or "file"
    return name[-255:]


@router.post("", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
async def upload(
    file: UploadFile,
    width: int | None = Form(default=None, ge=1, le=20000),
    height: int | None = Form(default=None, ge=1, le=20000),
    me: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    data = await file.read(MAX_BYTES + 1)
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file is empty")
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Files can be up to 5 MB")

    content_type = (file.content_type or "application/octet-stream").split(";")[0].strip().lower()
    is_image = content_type in IMAGE_TYPES
    att = Attachment(
        key=secrets.token_urlsafe(24),
        uploader_id=me.id,
        filename=_clean_filename(file.filename),
        content_type=content_type,
        size=len(data),
        width=width if is_image else None,
        height=height if is_image else None,
        data=data,
    )
    db.add(att)
    db.commit()
    return attachment_out(att)


@router.get("/{key}")
def download(key: str, db: Session = Depends(get_db)):
    att = db.scalar(select(Attachment).where(Attachment.key == key, Attachment.message_id.is_not(None)))
    if att is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    # Only known-safe image types render inline; everything else (including
    # SVG and HTML, which can carry scripts) is forced to download.
    inline = att.content_type in IMAGE_TYPES
    disposition = "inline" if inline else "attachment"
    return Response(
        content=att.data,
        media_type=att.content_type if inline else "application/octet-stream",
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(att.filename)}",
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox",
        },
    )
