
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.admin import AuditLog


def record_admin_audit(
    db: Session,
    *,
    admin_id: int,
    action: str,
    entity: str,
    entity_id: int | str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    request: Request | None = None,
) -> AuditLog:
    """
    Record an Admin action in the existing audit_log table.

    The caller is responsible for committing the transaction.
    This allows the data change and its audit log to be saved
    together, or rolled back together.

    Never pass passwords, tokens, TOTP secrets, or private
    mother health records into before/after.
    """

    client_ip = None

    if request is not None and request.client is not None:
        client_ip = request.client.host

    audit = AuditLog(
        admin_id=admin_id,
        action=action,
        entity=entity,
        entity_id=(
            str(entity_id)
            if entity_id is not None
            else None
        ),
        before_json=before,
        after_json=after,
        ip=client_ip,
    )

    db.add(audit)

    return audit
