"""End-to-end flows over REST + WebSocket with two or three real clients."""

import time

from conftest import auth, login, next_event

ALICE, BOB, PRIYA, DIEGO = "+15550100001", "+15550100002", "+15550100003", "+15550100006"


def _direct_with(client, h, other_id):
    r = client.post("/api/conversations/direct", json={"user_id": other_id}, headers=auth(h))
    assert r.status_code == 200
    return r.json()


def test_wrong_otp_rejected(client):
    r = client.post("/api/auth/verify-otp", json={"phone": ALICE, "code": "000000"})
    assert r.status_code == 400


def test_new_user_registration_and_profile(client):
    h = login(client, "+919876543210")
    me = client.get("/api/users/me", headers=auth(h)).json()
    assert me["display_name"] == ""
    convs = client.get("/api/conversations", headers=auth(h)).json()
    assert len(convs) == 1 and convs[0]["members"][0]["user"]["id"] == me["id"]  # Note to Self

    r = client.patch("/api/users/me", json={"display_name": "  New Person ", "username": "newbie.99"}, headers=auth(h))
    assert r.json()["display_name"] == "New Person"
    r = client.post("/api/contacts", json={"query": "alice.01"}, headers=auth(h))
    assert r.status_code == 201 and r.json()["user"]["display_name"] == "Alice Chen"

    client.post("/api/auth/logout", headers=auth(h))
    assert client.get("/api/users/me", headers=auth(h)).status_code == 401


def test_realtime_message_receipts_and_typing(client):
    a, b = login(client, ALICE), login(client, BOB)
    conv = _direct_with(client, a, b["_user"]["id"])

    with client.websocket_connect(f"/ws?token={a['_token']}") as wa, \
         client.websocket_connect(f"/ws?token={b['_token']}") as wb:
        next_event(wa, "ready")
        next_event(wb, "ready")

        # typing is relayed to the other member only
        wa.send_json({"type": "typing", "conversation_id": conv["id"], "is_typing": True})
        ev = next_event(wb, "typing")
        assert ev["user_id"] == a["_user"]["id"] and ev["is_typing"]

        r = client.post(f"/api/conversations/{conv['id']}/messages",
                        json={"body": "hello bob", "client_id": "c-1"}, headers=auth(a))
        assert r.status_code == 201
        msg = r.json()

        got = next_event(wb, "message.new")["message"]
        assert got["body"] == "hello bob" and got["status"] is None

        # sender: echo with "sent", then "delivered" because Bob is online
        assert next_event(wa, "message.new")["message"]["status"] == "sent"
        st = next_event(wa, "message.status")["updates"][0]
        assert st == {"id": msg["id"], "conversation_id": conv["id"], "status": "delivered"}

        # Bob opens the chat → read
        wb.send_json({"type": "read", "conversation_id": conv["id"]})
        st = next_event(wa, "message.status")["updates"]
        assert any(u["id"] == msg["id"] and u["status"] == "read" for u in st)

    # retrying with the same client_id doesn't duplicate
    r2 = client.post(f"/api/conversations/{conv['id']}/messages",
                     json={"body": "hello bob", "client_id": "c-1"}, headers=auth(a))
    assert r2.json()["id"] == msg["id"]


def test_offline_delivery_on_connect(client):
    a, d = login(client, ALICE), login(client, DIEGO)
    conv = _direct_with(client, a, d["_user"]["id"])
    msg = client.post(f"/api/conversations/{conv['id']}/messages",
                      json={"body": "you there?"}, headers=auth(a)).json()
    assert msg["status"] == "sent"

    unread = next(c for c in client.get("/api/conversations", headers=auth(d)).json() if c["id"] == conv["id"])
    assert unread["unread_count"] >= 1

    with client.websocket_connect(f"/ws?token={a['_token']}") as wa:
        next_event(wa, "ready")
        with client.websocket_connect(f"/ws?token={d['_token']}") as wd:
            next_event(wd, "ready")
            ev = next_event(wa, "message.status")
            assert any(u["id"] == msg["id"] and u["status"] == "delivered" for u in ev["updates"])


def test_group_admin_flow(client):
    a, b, p = login(client, ALICE), login(client, BOB), login(client, PRIYA)
    bob_id, priya_id = b["_user"]["id"], p["_user"]["id"]

    r = client.post("/api/conversations/group",
                    json={"title": "Test Group", "member_ids": [bob_id]}, headers=auth(a))
    assert r.status_code == 201
    g = r.json()
    assert g["my_role"] == "admin" and len(g["members"]) == 2

    # non-admin can't add
    assert client.post(f"/api/conversations/{g['id']}/members",
                       json={"user_ids": [priya_id]}, headers=auth(b)).status_code == 403
    r = client.post(f"/api/conversations/{g['id']}/members", json={"user_ids": [priya_id]}, headers=auth(a))
    assert len(r.json()["members"]) == 3

    client.post(f"/api/conversations/{g['id']}/messages", json={"body": "hi all"}, headers=auth(a))
    page = client.get(f"/api/conversations/{g['id']}/messages", headers=auth(p)).json()
    assert [m["body"] for m in page["messages"]][-2:] == ["members_added", "hi all"]

    # remove Bob: he keeps read-only history and can't send
    with client.websocket_connect(f"/ws?token={b['_token']}") as wb:
        next_event(wb, "ready")
        assert client.delete(f"/api/conversations/{g['id']}/members/{bob_id}", headers=auth(a)).status_code == 204
        assert next_event(wb, "message.new")["message"]["body"] == "member_removed"
        assert next_event(wb, "conversation.updated")["conversation"]["is_member"] is False
    assert client.post(f"/api/conversations/{g['id']}/messages",
                       json={"body": "let me back"}, headers=auth(b)).status_code == 403
    page = client.get(f"/api/conversations/{g['id']}/messages", headers=auth(b)).json()
    assert page["messages"][-1]["body"] == "member_removed"

    # last admin leaves → oldest remaining member is promoted
    client.delete(f"/api/conversations/{g['id']}/members/{a['_user']['id']}", headers=auth(a))
    g2 = client.get(f"/api/conversations/{g['id']}", headers=auth(p)).json()
    assert g2["my_role"] == "admin"


def test_replies_and_reactions(client):
    a, b = login(client, ALICE), login(client, BOB)
    conv = _direct_with(client, a, b["_user"]["id"])
    m1 = client.post(f"/api/conversations/{conv['id']}/messages", json={"body": "pizza?"}, headers=auth(a)).json()
    m2 = client.post(f"/api/conversations/{conv['id']}/messages",
                     json={"body": "yes!", "reply_to_id": m1["id"]}, headers=auth(b)).json()
    assert m2["reply_to"]["body"] == "pizza?"
    client.put(f"/api/messages/{m1['id']}/reaction", json={"emoji": "🍕"}, headers=auth(b))
    page = client.get(f"/api/conversations/{conv['id']}/messages", headers=auth(a)).json()
    target = next(m for m in page["messages"] if m["id"] == m1["id"])
    assert target["reactions"] == [{"user_id": b["_user"]["id"], "emoji": "🍕"}]


def test_disappearing_messages(client):
    a, b = login(client, ALICE), login(client, BOB)
    conv = _direct_with(client, a, b["_user"]["id"])
    client.patch(f"/api/conversations/{conv['id']}", json={"disappearing_seconds": 1}, headers=auth(a))
    m = client.post(f"/api/conversations/{conv['id']}/messages", json={"body": "poof"}, headers=auth(a)).json()
    assert m["expires_at"] is not None
    time.sleep(2.5)
    ids = [x["id"] for x in client.get(f"/api/conversations/{conv['id']}/messages", headers=auth(b)).json()["messages"]]
    assert m["id"] not in ids
    client.patch(f"/api/conversations/{conv['id']}", json={"disappearing_seconds": 0}, headers=auth(a))


PNG_1x1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
)


def test_attachments(client):
    a, b, d = login(client, ALICE), login(client, BOB), login(client, DIEGO)
    conv = _direct_with(client, a, b["_user"]["id"])

    r = client.post("/api/attachments", files={"file": ("pic.png", PNG_1x1, "image/png")},
                    data={"width": "1", "height": "1"}, headers=auth(a))
    assert r.status_code == 201, r.text
    att = r.json()
    assert att["is_image"] and att["width"] == 1
    # Not downloadable until it's actually sent in a message.
    assert client.get(att["url"]).status_code == 404

    # Someone else can't send Alice's upload.
    bob_conv = _direct_with(client, b, d["_user"]["id"])
    r = client.post(f"/api/conversations/{bob_conv['id']}/messages", json={"attachment_id": att["id"]}, headers=auth(b))
    assert r.status_code == 400

    # Image with no caption is a valid message.
    msg = client.post(f"/api/conversations/{conv['id']}/messages",
                      json={"attachment_id": att["id"], "client_id": "img-1"}, headers=auth(a)).json()
    assert msg["body"] == "" and msg["attachment"]["filename"] == "pic.png"
    # Retrying the same send is idempotent even though the attachment is now linked.
    again = client.post(f"/api/conversations/{conv['id']}/messages",
                        json={"attachment_id": att["id"], "client_id": "img-1"}, headers=auth(a))
    assert again.status_code == 201 and again.json()["id"] == msg["id"]

    page = client.get(f"/api/conversations/{conv['id']}/messages", headers=auth(b)).json()
    got = next(m for m in page["messages"] if m["id"] == msg["id"])
    file = client.get(got["attachment"]["url"])
    assert file.status_code == 200 and file.content == PNG_1x1 and file.headers["content-type"] == "image/png"

    # Non-image files are always served as downloads.
    r = client.post("/api/attachments", files={"file": ("x.html", b"<script>alert(1)</script>", "text/html")}, headers=auth(a))
    doc = client.post(f"/api/conversations/{conv['id']}/messages",
                      json={"attachment_id": r.json()["id"], "body": "notes"}, headers=auth(a)).json()
    dl = client.get(doc["attachment"]["url"])
    assert dl.headers["content-type"] == "application/octet-stream"
    assert dl.headers["content-disposition"].startswith("attachment;")


def test_empty_message_rejected(client):
    a, b = login(client, ALICE), login(client, BOB)
    conv = _direct_with(client, a, b["_user"]["id"])
    r = client.post(f"/api/conversations/{conv['id']}/messages", json={"body": "   "}, headers=auth(a))
    assert r.status_code == 422
