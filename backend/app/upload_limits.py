"""Bound upload bodies even when the client uses chunked transfer."""
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

MIB = 1024 * 1024
LIMITS = {"/api/admin/media": 11 * MIB, "/nutrition/scan": 6 * MIB, "/api/admin/foods/csv": 2 * MIB}


class BoundedUploads:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        cap = LIMITS.get(scope.get("path", "").rstrip("/"))
        if scope["type"] != "http" or scope.get("method") != "POST" or cap is None:
            await self.app(scope, receive, send)
            return
        lengths = [value for header, value in scope.get("headers", ()) if header == b"content-length"]
        if lengths and (len(lengths) != 1 or not lengths[0].isdigit() or len(lengths[0]) > 20):
            await JSONResponse({"detail":"Invalid upload size."}, status_code=400)(scope,receive,send)
            return
        if lengths and int(lengths[0]) > cap:
            await JSONResponse({"detail":"Upload exceeds the allowed size."}, status_code=413)(scope,receive,send)
            return
        received=0

        async def bounded_receive():
            nonlocal received
            message=await receive()
            if message["type"]=="http.request":
                received+=len(message.get("body",b""))
                if received > cap:
                    raise HTTPException(413,"Upload exceeds the allowed size.")
            return message

        await self.app(scope,bounded_receive,send)
