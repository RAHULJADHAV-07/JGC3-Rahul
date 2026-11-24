"""What a request body may hold, checked once, before any route reads it.

JSON lets through more than the database and the reports can carry, and what
does not fit surfaces late and badly:

  * `NaN` and `Infinity` — Python's reader takes them, a float column stores
    them, and from then on every list that includes the row fails to serialise.
    One such figure on one invoice closes the invoice list to everybody.
  * a NUL or half a surrogate pair in text — Postgres refuses it mid-write.
  * a number with forty digits, or a body nested three thousand deep — an
    unhandled error instead of an answer.

None of it is anything a form here sends, so it is refused at the door with a
sentence, and no route has to remember to check. The size of a body is capped
here too: nginx and Vercel cap it on their own paths, but the API's own address
is reachable without either.
"""
import json
import math

MAX_BYTES = 4 * 1024 * 1024      # as nginx.conf's client_max_body_size
MAX_DEPTH = 40
MAX_INT = 2 ** 53                # the largest whole number the browser can hold exactly

_BODYLESS = {"GET", "HEAD", "OPTIONS"}


class Refused(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status, self.detail = status, detail


def bad_text(s: str) -> bool:
    """Text the database cannot store: a NUL, or half of a surrogate pair."""
    return "\x00" in s or any(0xD800 <= ord(c) <= 0xDFFF for c in s)


def check(data) -> None:
    """Walk a decoded body and raise `Refused` for anything that cannot be kept."""
    stack = [(data, 1)]
    while stack:
        v, depth = stack.pop()
        if isinstance(v, bool) or v is None:
            continue
        if isinstance(v, str):
            if bad_text(v):
                raise Refused(422, "The text holds a character that cannot be stored")
        elif isinstance(v, float):
            if not math.isfinite(v):
                raise Refused(422, "A figure is not a number")
        elif isinstance(v, int):
            if abs(v) > MAX_INT:
                raise Refused(422, "A figure is too large")
        else:
            if depth > MAX_DEPTH:
                raise Refused(422, "The request is nested too deeply")
            if isinstance(v, dict):
                for k, x in v.items():
                    if bad_text(k):
                        raise Refused(422, "The text holds a character that cannot be stored")
                    stack.append((x, depth + 1))
            else:
                stack.extend((x, depth + 1) for x in v)


def read(body: bytes) -> None:
    """Raise `Refused` if these bytes are JSON that cannot be kept. Bytes that
    are not JSON at all are left for the route, which answers for itself."""
    try:
        data = json.loads(body)
    except RecursionError:
        raise Refused(422, "The request is nested too deeply")
    except ValueError as e:
        # Python's own guard on reading an integer of thousands of digits.
        if "integer string conversion" in str(e):
            raise Refused(422, "A figure is too large")
        return
    check(data)


class BodyGuard:
    """ASGI middleware around every route that takes a body."""

    def __init__(self, app, max_bytes: int = MAX_BYTES):
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        try:
            # A NUL in an address or a search reaches the same database.
            if b"%00" in scope.get("query_string", b"") or "\x00" in scope.get("path", ""):
                raise Refused(400, "The address holds a character that cannot be used")
            if scope["method"] in _BODYLESS:
                return await self.app(scope, receive, send)
            headers = {k: v for k, v in scope["headers"]}
            declared = headers.get(b"content-length", b"")
            if declared.isdigit() and int(declared) > self.max_bytes:
                raise Refused(413, "The request is too large")
            chunks, size, gone = [], 0, False
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    gone = True
                    break
                chunk = message.get("body", b"")
                size += len(chunk)
                if size > self.max_bytes:
                    raise Refused(413, "The request is too large")
                chunks.append(chunk)
                if not message.get("more_body"):
                    break
            body = b"".join(chunks)
            if body:
                read(body)
        except Refused as e:
            return await self._answer(send, e)

        sent = False

        async def replay():
            nonlocal sent
            if gone or sent:
                return await receive() if not gone else {"type": "http.disconnect"}
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}

        return await self.app(scope, replay, send)

    @staticmethod
    async def _answer(send, e: Refused):
        payload = json.dumps({"detail": e.detail}).encode()
        await send({"type": "http.response.start", "status": e.status, "headers": [
            (b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode())]})
        await send({"type": "http.response.body", "body": payload})
