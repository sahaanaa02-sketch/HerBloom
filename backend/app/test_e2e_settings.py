"""Authenticated A9 regressions. Writes roll back and SMTP is mocked."""
from datetime import timedelta
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

import pyotp
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, get_db
from app.e2e_fixtures import ADMIN_EMAIL, MOTHER_EMAIL
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.admin import AdminPermission, AdminRole, AdminUser, AuditLog
from app.models.user import User
from app.routers.admin_2fa import create_admin_access_token
from app.routers.admin_settings import now
from app.services import admin_invitation, app_settings
from app.services.auth_service import create_access_token


def run():
    authorize_e2e_launcher()
    preflight()
    from app.main import app

    # Invitation enrollment exercises the TOTP path even in password-only E2E profiles.
    with patch.object(settings, "E2E_ADMIN_PASSWORD_ONLY", False), engine.connect() as conn:
        tx = conn.begin()
        active_session = None

        def db():
            return active_session

        app.dependency_overrides[get_db] = db
        try:
            with Session(bind=conn, join_transaction_mode="create_savepoint") as s:
                main = s.scalar(select(AdminUser).where(AdminUser.email == ADMIN_EMAIL))
                super_role = s.scalar(select(AdminRole).where(AdminRole.name=="super_admin")) or AdminRole(name="super_admin")
                main.roles.append(super_role)
                editor = AdminRole(name="synthetic_a9_editor")
                permission = s.scalar(select(AdminPermission).where(AdminPermission.key=="audit.view"))
                auditor=AdminUser(email="a9-auditor.e2e@example.com",name="=Synthetic auditor",active=True,
                                  totp_enabled=True,password_hash="Synthetic token-only account",
                                  roles=[AdminRole(name="synthetic_a9_auditor",permissions=[permission])])
                s.add_all([editor,auditor])
                s.flush()
                primary, least, role_id = main.id, auditor.id, editor.id
                mother=s.scalar(select(User.id).where(User.email==MOTHER_EMAIL))
                s.add(AuditLog(admin_id=auditor.id,action="settings.updated",entity="app_settings",ip="127.0.0.7",
                               before_json={"body_en":"PRIVATE_PREVIOUS","totp_secret":"PRIVATE_SECRET","stage2_enabled":False},
                               after_json={"body_en":"PRIVATE_UPDATE","smtp_password":"PRIVATE_PASSWORD","stage2_enabled":True}))
                s.flush()
                audit_id = s.scalar(select(AuditLog.id).order_by(AuditLog.id.desc()).limit(1))
                s.commit()
            client=TestClient(app)
            tokens={"manager":create_admin_access_token(primary),"audit":create_admin_access_token(least),
                    "mother":create_access_token(mother,"MOTHER")}
            def call(method,path,status=200,role="manager",**kw):
                nonlocal active_session
                h={'Authorization':'Bearer '+tokens[role]} if role else {}
                with Session(bind=conn,join_transaction_mode="create_savepoint") as active_session:
                    r=client.request(method,path,headers=h,**kw)
                assert r.status_code==status,(path,r.status_code,r.text[:250] if "/auth/" not in path else "")
                return r
            def admin(method,path="",status=200,role="manager",**kw):
                return call(method,"/api/admin/settings"+path,status,role,**kw).json()

            admin("GET","/admins",403,"audit")
            admin("GET","",403,"audit")
            admin("GET","/audit",401,"mother")
            admin("POST",f"/admins/{primary}/deactivate",409)
            page=admin("GET","/admins")
            assert page["total"]>=2 and all(set(r)=={"id","name","email","active","totp_enabled","last_login_at","roles"} for r in page["items"])
            body={"name":"Synthetic invited A9 editor","email":"a9-editor.e2e@example.com","role_ids":[role_id]}
            with patch.object(settings,"A9_ADMIN_INVITES_ENABLED",False), patch.object(admin_invitation.smtplib,"SMTP") as disabled:
                assert not admin("GET","/admins")["invitation_delivery_enabled"]
                admin("POST","/admins/invite",503,json=body)
                disabled.assert_not_called()
                assert conn.exec_driver_sql("SELECT COUNT(*) FROM admin_invites").scalar_one()==0
            print("PASS settings permissions, safe account projection, self-lockout and default-off invitation delivery")

            provider={"ACCOUNT_SMTP_HOST":"smtp.e2e.invalid","ACCOUNT_SMTP_FROM":"synthetic@example.com",
                      "ACCOUNT_EMAIL_FRONTEND_ORIGIN":"https://e2e.invalid"}
            captured=[]
            def capture(msg):
                captured.append(msg.get_content().strip().split("#")[-1])
            with patch.object(settings,"A9_ADMIN_INVITES_ENABLED",True), patch.object(
                admin_invitation,"external_setting",side_effect=lambda key,default=None:provider.get(key,default)
            ), patch.object(admin_invitation.smtplib,"SMTP") as smtp:
                handler=smtp.return_value.__enter__.return_value
                handler.send_message.side_effect=capture
                sent=admin("POST","/admins/invite",201,json=body)
                assert set(sent)=={"message"} and captured
                uid,expiry,stored=conn.exec_driver_sql("SELECT admin_id,expires_at,token_hash FROM admin_invites").one()
                assert stored!=captured[0] and now()+timedelta(hours=47)<expiry<=now()+timedelta(hours=48), (stored!=captured[0], (expiry-now()).total_seconds())
                conn.exec_driver_sql("UPDATE admin_invites SET expires_at=%s WHERE admin_id=%s",(now()-timedelta(minutes=1),uid))
                call("POST","/api/admin/auth/accept-invite",400,None,json={"token":captured[0],"password":"Synthetic secret phrase"})
                admin("POST","/admins/invite",201,json=body)
                assert handler.starttls.call_count==handler.send_message.call_count==2
                invite=captured[-1]
            password="Synthetic invitational password"
            call("POST","/api/admin/auth/accept-invite",200,None,json={"token":invite,"password":password})
            call("POST","/api/admin/auth/accept-invite",400,None,json={"token":invite,"password":password})
            bad=call("POST","/api/admin/auth/accept-invite",422,None,json={"token":"PROBE_SECRET","password":"x"})
            assert "PROBE_SECRET" not in bad.text
            login=call("POST","/api/admin/auth/login",200,None,json={"email":body["email"],"password":password}).json()
            challenge=login["challenge_token"]
            setup=call("POST","/api/admin/auth/2fa/setup",200,None,json={"challenge_token":challenge}).json()
            secret=parse_qs(urlsplit(setup["otpauth_uri"]).query)["secret"][0]
            credentials=call("POST","/api/admin/auth/2fa/verify",200,None,json={"challenge_token":challenge,"code":pyotp.TOTP(secret).now()}).json()
            tokens["invitee"]=credentials["access_token"]
            call("GET","/api/admin/me",200,"invitee")
            admin("GET","/admins",403,"invitee")
            admin("POST",f"/admins/{uid}/reset-2fa")
            call("GET","/api/admin/me",401,"invitee")
            call("POST","/api/admin/auth/2fa/setup",401,None,json={"challenge_token":challenge})
            roles=admin("PUT",f"/admins/{uid}/roles",json={"role_ids":[role_id]})
            assert [role["id"] for role in roles["roles"]]==[role_id]
            admin("POST",f"/admins/{uid}/deactivate")
            call("POST","/api/admin/auth/login",401,None,json={"email":body["email"],"password":password})
            print("PASS 48-hour single-use invitations, mocked TLS mail, existing 2FA enrollment and session invalidation")

            baseline=admin("GET")
            changed={**baseline,"support_email":"support@example.com","maintenance_banner_en":"Synthetic notice",
                     "maintenance_banner_ta":"சோதனை","stage2_enabled":True}
            admin("PUT",json=changed,role="audit",status=403)
            admin("PUT",json={**changed,"A7_EXPORTS_ENABLED":True},status=422)
            admin("PUT",json={**changed,"supported_languages":["ta"]},status=422)
            assert admin("PUT",json=changed)==changed
            assert admin("GET")==changed
            public=call("GET","/api/public/settings",200,None).json()
            assert "stage2_enabled" not in public and public["support_email"]=="support@example.com"
            assert call("GET","/api/admin/overview").json()["stage2_enabled"] is True
            assert not(settings.A7_EXPORTS_ENABLED or settings.A7_OUTBOUND_EMAIL_ENABLED)
            print("PASS persisted allowlisted settings, public projection and no A7 gate changes")

            draft={"type":"privacy","body_en":"# Synthetic privacy v1","body_ta":"# சோதனை"}
            first=admin("POST","/legal",201,json=draft)
            assert first["version"]==1 and call("GET","/api/public/legal",200,None).json()==[]
            admin("POST",f"/legal/{first['id']}/publish",403,"audit")
            admin("POST",f"/legal/{first['id']}/publish")
            nxt=admin("POST","/legal",201,json={**draft,"body_en":"# Synthetic privacy v2"})
            assert call("GET","/api/public/legal",200,None).json()[0]["version"]==1
            admin("PUT",f"/legal/{first['id']}",409,json=draft)
            admin("PUT",f"/legal/{nxt['id']}",json={**draft,"body_en":"# Synthetic revised v2"})
            admin("POST",f"/legal/{nxt['id']}/publish")
            assert call("GET","/api/public/legal",200,None).json()[0]["body_en"]=="# Synthetic revised v2"
            assert len(admin("GET","/legal",params={"type":"privacy"})["items"])==2
            print("PASS bilingual drafts, publication permissions, isolation, latest legal version and immutable history")

            filtered=admin("GET","/audit",role="audit",params={"admin_id":least,"entity":"app_settings","action":"settings.updated"})
            assert filtered["total"]==1 and filtered["items"][0]["id"]==audit_id
            admin("GET","/audit",422,"audit",params={"from_date":"2026-11-20","to_date":"2026-11-19"})
            diff=admin("GET",f"/audit/{audit_id}",role="audit")
            assert diff["changed_fields"]==["body_en","stage2_enabled"]
            assert diff["before"]["body_en"]=="[redacted]" and diff["after"]["stage2_enabled"] is True
            assert "PRIVATE_" not in str(diff) and "127.0.0.7" not in str(diff)
            file=call("GET","/api/admin/settings/audit.csv",role="audit",params={"admin_id":least})
            assert "PRIVATE_" not in file.text and "'=Synthetic auditor" in file.text
            assert file.headers["cache-control"]=="no-store"
            with Session(bind=conn,join_transaction_mode="create_savepoint") as s:
                actions=set(s.scalars(select(AuditLog.action)))
                assert {"settings.updated","settings.audit.downloaded","admin.invite.sent","admin.invite.accepted",
                        "admin.reset-2fa","admin.roles.updated","admin.deactivate","legal.published"}<=actions
                assert app_settings.read_settings(s).stage2_enabled
            print("PASS audit filters, redacted JSON differences, CSV injection protection and admin audit events")
        finally:
            tx.rollback()
            app.dependency_overrides.clear()


if __name__ == "__main__":
    run()
