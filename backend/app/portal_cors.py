"""Apply separate CORS policies to the Admin API and the rest of the app."""
from starlette.datastructures import MutableHeaders
from starlette.middleware.cors import CORSMiddleware


class PortalCORS:
    def __init__(self, app, *, admins, mothers):
        options = {"allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                   "allow_headers": ["Authorization", "Content-Type", "Idempotency-Key"],
                   "expose_headers": ["Retry-After"]}
        self.admin = CORSMiddleware(app, allow_origins=admins, **options)
        self.mother = CORSMiddleware(app, allow_origins=mothers, **options)

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        admin = path == "/api/admin" or path.startswith("/api/admin/")
        api = self.admin if admin else self.mother
        sensitive = admin or path.startswith("/auth/") or any(
            key == b"authorization" for key, _ in scope.get("headers", ())
        )

        async def secure_send(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                if sensitive:
                    headers.setdefault("Cache-Control", "no-store")
            await send(message)

        await api(scope, receive, secure_send)
