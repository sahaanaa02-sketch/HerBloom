"""Provision one demo account per Admin role in the guarded E2E schema."""
import json
import os
import secrets

from sqlalchemy import select

from app.config import e2e_home
from app.database import SessionLocal
from app.e2e_guard import preflight, verify_database_identity
from app.models.admin import AdminPermission, AdminRole, AdminUser
from app.seed.sync_admin_permissions import ROLE_PERMISSIONS
from app.services.auth_service import hash_password, verify_password


def new_credentials():
    return {role: {"password": secrets.token_urlsafe(24)}
            for role in ROLE_PERMISSIONS}


def demo_email(role):
    return "a14-" + role.replace("_", "-") + ".e2e@example.com"


def provision(db, credentials):
    if set(credentials) != set(ROLE_PERMISSIONS):
        raise ValueError("The private demo file must contain exactly the supported roles.")
    admins = {}
    permissions = {row.key: row for row in db.scalars(select(AdminPermission))}
    for role_name, keys in ROLE_PERMISSIONS.items():
        configured = credentials[role_name]
        password = configured["password"]
        if not isinstance(password,str) or len(password)<24:
            raise ValueError("Invalid synthetic demo credentials.")
        role = db.scalar(select(AdminRole).where(AdminRole.name==role_name))
        if role is None:
            for key in keys - permissions.keys():
                permissions[key] = AdminPermission(key=key)
            role = AdminRole(name=role_name, permissions=[permissions[key] for key in sorted(keys)])
            db.add(role)
            db.flush()
        elif {permission.key for permission in role.permissions} != keys:
            raise ValueError("The existing demo role differs from the approved matrix.")
        email=demo_email(role_name)
        admin=db.scalar(select(AdminUser).where(AdminUser.email==email))
        if admin is None:
            admin=AdminUser(email=email,name="E2E "+role_name,password_hash=hash_password(password),
                            active=True,roles=[role])
            db.add(admin)
            db.flush()
        elif (not admin.active or
              not verify_password(password,admin.password_hash) or [item.name for item in admin.roles]!=[role_name]):
            raise ValueError("Refusing to modify an existing demo identity.")
        admins[role_name]=admin.id
    return admins


def main():
    preflight()
    path=e2e_home()/"a14-demo-credentials.json"
    if path.resolve()!=path:
        raise RuntimeError("Demo credentials must stay in the dedicated private E2E directory.")
    if not path.exists():
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,"w",encoding="utf-8") as output:
            json.dump(new_credentials(),output,indent=2)
    with SessionLocal.begin() as db:
        verify_database_identity(db.connection())
        provision(db,json.loads(path.read_text(encoding="utf-8")))
    print("Isolated Admin role accounts ready. Credentials are in the private A14 demo file.")


if __name__=="__main__":
    main()
