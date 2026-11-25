"""Authenticated A7 tests using transaction-scoped E2E records and test mail capture."""
import io
import json
import os
from datetime import timedelta
from unittest.mock import patch
from zipfile import ZipFile

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, settings
from app.database import engine, get_db
from app.e2e_fixtures import ADMIN_EMAIL
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.admin import AdminPermission, AdminRole, AdminUser, AuditLog
from app.models.chat import ChatMessage, ChatSession
from app.models.mother_profile import MotherProfile
from app.models.user import User
from app.models.wellbeing import JournalEntry
from app.routers import admin_users
from app.services.admin_security import create_admin_access_token
from app.services.auth_service import create_access_token, hash_password
from app.services.journal_crypto import encrypt_text
from app.services import mother_account, user_privacy as privacy


def assert_disabled(operation, status=503):
    try:
        operation()
    except HTTPException as error:
        assert error.status_code == status
    else:
        raise AssertionError("Expected a disabled-feature response.")


def test_flag_configuration():
    example = dict(DB_USER="test", DB_PASSWORD="test", DB_NAME="test", SECRET_KEY="test")
    with patch.dict(os.environ, {}, clear=True):
        defaults = Settings(_env_file=None, **example)
        assert not defaults.A7_EXPORTS_ENABLED and not defaults.A7_OUTBOUND_EMAIL_ENABLED
        for value, expected in ((None,False),("",False),("invalid",False),("false",False),("0",False),
                                ("1",False),("yes",False),("true",True),(" TrUe ",True)):
            configured = Settings(_env_file=None, **example, A7_EXPORTS_ENABLED=value, A7_OUTBOUND_EMAIL_ENABLED=value)
            assert configured.A7_EXPORTS_ENABLED is expected and configured.A7_OUTBOUND_EMAIL_ENABLED is expected


def run():
    test_flag_configuration()
    with patch.object(settings,"A7_EXPORTS_ENABLED",True), patch.object(settings,"A7_OUTBOUND_EMAIL_ENABLED",True):
        run_enabled_suite()


def run_enabled_suite():
    authorize_e2e_launcher()
    preflight()
    from app.main import app
    generated = set()
    delivered = []
    with engine.connect() as conn:
        transaction = conn.begin()
        active_session = None

        def db():
            return active_session

        app.dependency_overrides[get_db] = db
        try:
            with Session(bind=conn, join_transaction_mode="create_savepoint") as s:
                permissions = s.scalars(select(AdminPermission).where(
                    AdminPermission.key.in_(("users.view", "users.manage", "data_requests.confirm")))).all()
                if not any(p.key == "data_requests.confirm" for p in permissions):
                    permissions.append(AdminPermission(key="data_requests.confirm"))
                supervisor_role = s.scalar(select(AdminRole).where(AdminRole.name == "super_admin"))
                if supervisor_role is None:
                    supervisor_role = AdminRole(name="super_admin", permissions=permissions)
                else:
                    supervisor_role.permissions.extend(p for p in permissions if p not in supervisor_role.permissions)
                supervisor = AdminUser(name="Synthetic A7 supervisor",email="a7-supervisor.e2e@example.com",
                                       password_hash="Synthetic token-only account",active=True,
                                       roles=[supervisor_role])
                s.add(supervisor)
                support=s.scalar(select(AdminUser).where(AdminUser.email==ADMIN_EMAIL))
                first=User(username="a7_first",email="a7-first.e2e@example.com",full_name="Synthetic A7 First",
                           hashed_password=hash_password("Synthetic test password"),role="MOTHER",is_active=True)
                second=User(username="a7_second",email="a7-second.e2e@example.com",full_name="Synthetic A7 Second",
                            hashed_password=hash_password("Other synthetic password"),role="MOTHER",is_active=True)
                s.add_all([first,second])
                s.flush()
                aid,bid,superid,supportid=first.id,second.id,supervisor.id,support.id
                for uid,lang,text in ((aid,"en","First journal only"),(bid,"ta","Second journal only")):
                    s.add(MotherProfile(user_id=uid,language=lang,display_name="A7 synthetic "+lang))
                    s.add(JournalEntry(user_id=uid,content=encrypt_text(text)))
                    chat=ChatSession(user_id=uid,title=text)
                    s.add(chat)
                    s.flush()
                    s.add(ChatMessage(session_id=chat.id,role="user",content=text,language=lang))
                s.commit()
            client=TestClient(app)
            roles={"support": create_admin_access_token(supportid), "super":create_admin_access_token(superid),
                   "mother":create_access_token(aid,"MOTHER")}
            def call(method,path,status=200,role="support",**kw):
                nonlocal active_session
                h={"Authorization":"Bearer "+roles[role]} if role else {}
                with Session(bind=conn,join_transaction_mode="create_savepoint") as active_session:
                    r=client.request(method,path,headers=h,**kw)
                assert r.status_code==status,(path,r.status_code,r.text[:300] if "download" not in path else "")
                return r
            def admin(method,path,status=200,role="support",**kw):
                return call(method,"/api/admin/"+path,status,role,**kw).json()

            page=admin("GET","users",params={"q":"a7-","page_size":1})
            assert page["total"]==2 and len(page["items"])==1
            assert admin("GET","users",params={"q":"a7-","language":"ta"})["items"][0]["id"]==bid
            safe={"id","display_name","email","language","created_at","last_active_at","plan_name","status"}
            assert set(page["items"][0])==safe
            assert set(admin("GET",f"users/{aid}"))==safe|{"history"}
            admin("GET","users",401,"mother")
            from app.services import entitlements
            plans = conn.begin_nested()
            try:
                stamp = privacy.now()
                conn.exec_driver_sql("UPDATE users SET activated_at_utc=%s WHERE id IN (%s,%s)",
                                     (stamp - timedelta(days=40), aid, bid))
                assert admin("GET", f"users/{aid}")["plan_name"] == "free"
                with Session(bind=conn,join_transaction_mode="rollback_only") as plan_session:
                    entitlements.insert_period(plan_session, aid, "trial", "a7-test-trial", stamp - timedelta(days=1))
                    entitlements.insert_period(plan_session, bid, "premium", "a7-test-premium", stamp - timedelta(days=1))
                assert {item["plan_name"] for item in admin("GET","users",params={"q":"a7-"})["items"]} == {"trial","premium"}
                assert admin("GET", f"users/{bid}")["plan_name"] == "premium"
            finally:
                if plans.is_active:
                    plans.rollback()
            print("PASS authoritative Free, Trial and Premium plan projection")
            admin("POST",f"users/{aid}/deactivate")
            assert admin("GET","users",params={"q":"a7-","status":"inactive"})["total"]==1
            call("GET","/auth/me",401,"mother")
            admin("POST",f"users/{aid}/reactivate")
            call("GET","/auth/me",401,"mother")
            print("PASS list privacy, search, pagination, language/status filters, role separation and session revocation")

            provider = {"ACCOUNT_SMTP_HOST":"smtp.e2e.invalid", "ACCOUNT_SMTP_FROM":"test@example.com",
                        "ACCOUNT_EMAIL_FRONTEND_ORIGIN":"https://e2e.invalid"}
            def capture(message):
                content = message.get_content().splitlines()
                code = next((line.split(": ",1)[1] for line in content if line.startswith("Your verification code is: ")), None)
                if code is not None:
                    assert len(code) == 6 and code.isdigit()
                    assert all("/reset-password" not in line for line in content)
                    delivered.append((str(message["To"]), "password_reset", code))
                else:
                    link = next(line for line in content if line.startswith("https://e2e.invalid/verify-email#"))
                    delivered.append((str(message["To"]), "verify_email", link.split("#",1)[1]))
            def synthetic_provider(key, default=None):
                return provider.get(key,default)

            with patch.object(settings,"A7_OUTBOUND_EMAIL_ENABLED",False), patch.object(
                mother_account, "external_setting", side_effect=synthetic_provider
            ), patch.object(mother_account.smtplib,"SMTP") as smtp, patch.object(
                mother_account,"forgot_password",wraps=mother_account.forgot_password
            ) as background:
                before_tokens = conn.exec_driver_sql("SELECT COUNT(*) FROM mother_account_tokens").scalar_one()
                before_audit = conn.exec_driver_sql("SELECT COUNT(*) FROM audit_log").scalar_one()
                admin("POST",f"users/{aid}/send-reset",503)
                admin("POST",f"users/{aid}/resend-verification",503)
                known = call("POST","/auth/forgot-password",202,None,json={"email":"a7-first.e2e@example.com"}).json()
                unknown = call("POST","/auth/forgot-password",202,None,json={"email":"unknown.e2e@example.com"}).json()
                assert known == unknown
                background.assert_not_called()
                mother_account.forgot_password("a7-first.e2e@example.com")
                assert_disabled(lambda: mother_account.issue_token(None,None,"password_reset"))
                assert_disabled(lambda: mother_account.send_account_email("test@example.com","password_reset","secret"))
                assert_disabled(lambda: mother_account.deliver_smtp("smtp.e2e.invalid",None))
                smtp.assert_not_called()
                assert conn.exec_driver_sql("SELECT COUNT(*) FROM mother_account_tokens").scalar_one() == before_tokens
                assert conn.exec_driver_sql("SELECT COUNT(*) FROM audit_log").scalar_one() == before_audit
            print("PASS email OFF, no scheduling/token/SMTP side effects, default-off and generic responses")

            with patch.object(mother_account,"external_setting",side_effect=synthetic_provider), patch.object(
                mother_account.smtplib,"SMTP"
            ) as smtp:
                client_mock = smtp.return_value.__enter__.return_value
                client_mock.send_message.side_effect = capture
                admin("POST",f"users/{aid}/send-reset")
                email,purpose,code=delivered[-1]
                assert email=="a7-first.e2e@example.com" and purpose=="password_reset"
                call("POST","/auth/verify-email",422,None,json={"token":code})
                token=call("POST","/auth/password-reset/verify",200,None,json={"email":email,"code":code}).json()["reset_token"]
                call("POST","/auth/verify-email",400,None,json={"token":token})
                call("POST","/auth/reset-password",200,None,json={"token":token,"password":"New synthetic password"})
                call("POST","/auth/reset-password",400,None,json={"token":token,"password":"New synthetic password"})
                login=call("POST","/auth/login",200,None,data={"username":email,"password":"New synthetic password"}).json()
                roles["mother"]=login["access_token"]
                admin("POST",f"users/{aid}/resend-verification")
                assert delivered[-1][1]=="verify_email"
                call("POST","/auth/verify-email",200,None,json={"token":delivered[-1][2]})
                call("POST","/auth/verify-email",400,None,json={"token":delivered[-1][2]})
                assert admin("GET",f"users/{aid}")["last_active_at"]
                assert client_mock.starttls.call_count == client_mock.send_message.call_count == 2
            with patch.object(mother_account,"forgot_password") as background:
                known=call("POST","/auth/forgot-password",202,None,json={"email":"a7-first.e2e@example.com"}).json()
                unknown=call("POST","/auth/forgot-password",202,None,json={"email":"unknown.e2e@example.com"}).json()
                assert known==unknown and background.call_count==2
            invalid = call("POST","/auth/reset-password",422,None,json={"token":"NoEcho","password":"Ab"})
            assert "NoEcho" not in invalid.text and "input" not in invalid.text
            print("PASS mocked reset and verification delivery, purpose isolation, one-time tokens and generic public responses")

            with patch.object(settings,"A7_EXPORTS_ENABLED",False):
                export=admin("POST","data-requests",201,json={"user_id":aid,"type":"export"})["id"]
                before = conn.exec_driver_sql("SELECT * FROM data_requests WHERE id=%s",(export,)).one()
                before_audit = conn.exec_driver_sql("SELECT COUNT(*) FROM audit_log").scalar_one()
                before_files = set(privacy.export_root().glob("*.zip"))
                admin("POST",f"data-requests/{export}/confirm",503,"super")
                admin("POST",f"data-requests/{export}/download-ticket",503,"super")
                admin("POST",f"data-requests/{export}/download",503,"super",json={"token":"a"*43})
                gated = admin("GET",f"data-requests/{export}",200,"super")
                assert not gated["can_download"] and not gated["export_confirmation_enabled"]
                assert_disabled(lambda: privacy.create_export(None,aid))
                assert conn.exec_driver_sql("SELECT * FROM data_requests WHERE id=%s",(export,)).one()==before
                assert conn.exec_driver_sql("SELECT COUNT(*) FROM audit_log").scalar_one()==before_audit
                assert set(privacy.export_root().glob("*.zip")) == before_files
            print("PASS export OFF, support initiation allowed and no processing or ZIP creation")
            other=admin("POST","data-requests",201,json={"user_id":bid,"type":"export"})["id"]
            admin("POST",f"data-requests/{export}/confirm",403)
            admin("POST",f"data-requests/{export}/download-ticket",404,"super")
            finished=admin("POST",f"data-requests/{export}/confirm",200,"super")
            assert finished["status"]=="done" and "file_path" not in finished
            file_name=conn.exec_driver_sql("SELECT file_path FROM data_requests WHERE id=%s",(export,)).scalar_one()
            generated.add(privacy.file_for(file_name))
            assert generated.copy().pop().is_file()
            admin("POST",f"data-requests/{other}/confirm",200,"super")
            other_file=conn.exec_driver_sql("SELECT file_path FROM data_requests WHERE id=%s",(other,)).scalar_one()
            generated.add(privacy.file_for(other_file))
            admin("POST",f"data-requests/{export}/download-ticket",403)
            ticket=admin("POST",f"data-requests/{export}/download-ticket",200,"super")["token"]
            with patch.object(settings,"A7_EXPORTS_ENABLED",False):
                before = conn.exec_driver_sql("SELECT * FROM data_requests WHERE id=%s",(export,)).one()
                assert not admin("GET",f"data-requests/{export}",200,"super")["can_download"]
                admin("POST",f"data-requests/{export}/download-ticket",503,"super")
                admin("POST",f"data-requests/{export}/download",503,"super",json={"token":ticket})
                assert conn.exec_driver_sql("SELECT * FROM data_requests WHERE id=%s",(export,)).one()==before
            print("PASS export OFF blocks existing file and pre-existing ticket redemption")
            admin("POST",f"data-requests/{other}/download",404,"super",json={"token":ticket})
            binary=call("POST",f"/api/admin/data-requests/{export}/download",200,"super",json={"token":ticket})
            assert binary.headers["cache-control"]=="no-store"
            with ZipFile(io.BytesIO(binary.content)) as z:
                account=json.loads(z.read("account.json"))
                assert account["id"]==aid and "hashed_password" not in account
                assert json.loads(z.read("journal_entries.json"))[0]["content"]=="First journal only"
                assert all(r["content"]=="First journal only" for r in json.loads(z.read("chat_messages.json")))
                assert "mother_account_tokens.json" not in z.namelist()
                assert all(b"Second journal only" not in z.read(f) for f in z.namelist())
            admin("POST",f"data-requests/{export}/download",404,"super",json={"token":ticket})
            conn.exec_driver_sql("UPDATE data_requests SET expires_at=%s WHERE id=%s",(privacy.now()-timedelta(seconds=1),other))
            admin("POST",f"data-requests/{other}/download-ticket",404,"super")
            print("PASS private ZIP generation, role and request binding, cross-user exclusion, download replay and expiry")

            deletion=admin("POST","data-requests",201,json={"user_id":aid,"type":"delete"})["id"]
            path=f"data-requests/{deletion}"
            admin("POST",path+"/execute-test-deletion",409,"super")
            impact=admin("GET",path+"/impact",200,"super")
            assert impact["records"]["journal_entries"]==impact["records"]["chat_messages"]==1
            assert not impact["production_execution_enabled"] and impact["private_export_files"]==1
            assert admin("POST",path+"/confirm",200,"super")["status"]=="confirmed"
            assert admin("GET",path+"/impact",200,"super")["records"]["journal_entries"]==1
            with patch.object(admin_users,"E2E_MODE",False), patch.object(privacy,"E2E_MODE",False):
                admin("POST",path+"/execute-test-deletion",409,"super")
                assert_disabled(lambda: privacy.execute_test_deletion(None,None),409)
            assert admin("GET",path,200,"super")["status"]=="confirmed"
            assert admin("GET",path+"/impact",200,"super")["records"]["journal_entries"]==1
            assert privacy.file_for(file_name).is_file()
            print("PASS production-mode deletion blocked at route and service; confirmed data and files intact")
            assert admin("POST",path+"/execute-test-deletion",200,"super")["status"]=="done"
            assert admin("GET",f"users/{aid}")["status"]=="anonymized"
            assert admin("GET",path+"/impact",200,"super")["records"]["journal_entries"]==0
            assert conn.exec_driver_sql("SELECT COUNT(*) FROM journal_entries WHERE user_id=%s",(bid,)).scalar_one()==1
            assert not privacy.file_for(file_name).exists() and privacy.file_for(other_file).exists()
            with Session(bind=conn,join_transaction_mode="create_savepoint") as s:
                logs=s.scalars(select(AuditLog).where(AuditLog.entity=="users")).all()
                assert {"users.deactivate","users.reactivate","data_request.export_generated","data_request.downloaded",
                        "data_request.synthetic_deletion_done"}<={r.action for r in logs}
                assert all(r.before_json is None and (r.after_json is None or set(r.after_json)=={"request_id"}) for r in logs)
            print("PASS review-only confirmation, E2E deletion, private file removal, other-account preservation and audit sanitization")
        finally:
            transaction.rollback()
            app.dependency_overrides.clear()
            for path in generated:
                path.unlink(missing_ok=True)


if __name__ == "__main__":
    run()
