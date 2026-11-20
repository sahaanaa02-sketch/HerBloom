"""A12 sandbox lifecycle tests. No provider traffic or persisted fixtures."""
from datetime import datetime, timedelta
from hashlib import md5
from unittest.mock import MagicMock, patch
from uuid import uuid4

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, get_db
from app.e2e_fixtures import ADMIN_EMAIL, MOTHER_EMAIL
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.admin import AdminPermission, AdminRole, AdminUser
from app.models.user import User
from app.routers.admin_2fa import create_admin_access_token
from app.services import entitlements, free_quota, payhere, user_privacy
from app.services.auth_service import create_access_token

BASE = "/api/billing"
ADMIN = "/api/admin/billing"
MERCHANT = "1234567"
SECRET = "synthetic-not-a-payhere-secret"


def digest(value):
    return md5(value.encode(), usedforsecurity=False).hexdigest().upper()


def callback(reference, code="2", amount="790.00", currency="LKR", merchant=MERCHANT, payment="112233", signature=None):
    return {"order_id": reference, "merchant_id": merchant, "status_code": code,
            "payhere_amount": amount, "payhere_currency": currency, "payment_id": payment,
            "md5sig": signature or digest(merchant+reference+amount+currency+code+digest(SECRET)),
            "card_no": "synthetic-card-field", "status_message": "synthetic-processor-free-text"}


def run():
    authorize_e2e_launcher()
    preflight()
    from app.main import app

    with engine.connect() as conn:
        outer=conn.begin()
        active=None

        def isolated():
            return Session(bind=conn, join_transaction_mode="create_savepoint")

        app.dependency_overrides[get_db]=lambda: active
        try:
            with isolated() as db:
                mother=db.scalar(select(User.id).where(User.email==MOTHER_EMAIL))
                manager=db.scalar(select(AdminUser).where(AdminUser.email==ADMIN_EMAIL))
                permissions=[]
                for key in ("billing.view","billing.manage"):
                    permission=db.scalar(select(AdminPermission).where(AdminPermission.key==key))
                    permissions.append(permission or AdminPermission(key=key))
                manager.roles.append(AdminRole(name="a12_sandbox_billing_manager",permissions=permissions))
                outsider=AdminUser(name="E2E billing outsider",email="a12-billing-admin@example.com",
                                   password_hash="synthetic",active=True,totp_enabled=True)
                db.add(outsider)
                db.flush()
                manager_id,outsider_id=manager.id,outsider.id
                db.commit()
                user_privacy.ownership_verified(db)
            other=conn.exec_driver_sql(
                "INSERT INTO users (username,full_name,email,hashed_password,role,is_active,activated_at_utc)"
                " VALUES ('payhere_other_e2e','Synthetic','a12-payhere-other@example.com','synthetic','MOTHER',1,%s)",
                (entitlements.utc_naive(free_quota.utc_now()),),
            ).lastrowid
            auth={"mother":create_access_token(mother,"MOTHER"),"other":create_access_token(other,"MOTHER"),
                  "manager":create_admin_access_token(manager_id),"outsider":create_admin_access_token(outsider_id)}
            client=TestClient(app)

            def call(method,path,status=200,who="mother",key=None,**kw):
                nonlocal active
                headers={"Authorization":"Bearer "+auth[who]} if who else {}
                if key:
                    headers["Idempotency-Key"]=str(key)
                with isolated() as active:
                    result=client.request(method,path,headers=headers,**kw)
                assert result.status_code==status,(path,status,result.status_code,result.text[:350])
                return result.json()

            def checkout(key=None, who="mother"):
                return call("POST",BASE+"/checkout",who=who,key=key or uuid4(),json={"plan":"premium"})

            def provider(ref, expect=200, **kw):
                return call("POST",BASE+"/payhere/notify",expect,who=None,data=callback(ref,**kw))

            def state(ref, who="mother"):
                return call("GET",BASE+"/orders/"+ref,who=who)

            start=free_quota.utc_now()+timedelta(seconds=1)
            fake_configuration={
                "A12_PAYHERE_SANDBOX_ENABLED":True, "A12_PAYHERE_MERCHANT_ID":MERCHANT,
                "A12_PAYHERE_MERCHANT_SECRET":SecretStr(SECRET),
                "A12_PAYHERE_NOTIFY_URL":"https://sandbox-fixture.example.com/api/billing/payhere/notify",
                "A12_PAYHERE_APP_ID":"synthetic-app", "A12_PAYHERE_APP_SECRET":SecretStr("synthetic-oauth-secret"),
            }
            with patch.object(settings,"A12_PAYHERE_SANDBOX_ENABLED",False):
                call("POST",BASE+"/checkout",503,key=uuid4(),json={"plan":"premium"})
            with patch.multiple(settings,**fake_configuration), patch.object(free_quota,"utc_now",return_value=start) as clock:
                with patch.object(payhere,"E2E_MODE",False):
                    call("POST",BASE+"/checkout",503,key=uuid4(),json={"plan":"premium"})
                with patch.object(settings,"A12_PAYHERE_NOTIFY_URL","https://127.0.0.1/api/billing/payhere/notify"):
                    call("POST",BASE+"/checkout",503,key=uuid4(),json={"plan":"premium"})
                call("POST",BASE+"/checkout",401,who=None,key=uuid4(),json={"plan":"premium"})
                for bad in ({"plan":"premium","price":"1.00"},{"plan":"premium","promo":"anything"},{"plan":"trial"}):
                    call("POST",BASE+"/checkout",422,key=uuid4(),json=bad)
                call("POST",BASE+"/trial/start",201,json={"confirm":True})
                key=uuid4()
                first=checkout(key)
                ref=first["order_ref"]
                assert first["amount_lkr"]=="790.00" and first["status"]=="pending"
                assert first["checkout"]["sandbox"] is True and first["checkout"]["currency"]=="LKR"
                assert first["checkout"]["hash"]==digest(MERCHANT+ref+"790.00LKR"+digest(SECRET))
                assert SECRET not in str(first)
                assert checkout(key)["order_ref"]==ref
                call("POST",BASE+"/checkout",409,key=uuid4(),json={"plan":"premium"})
                call("GET",BASE+"/orders/"+ref,404,who="other")
                call("GET",BASE+"/receipts/"+ref,404,who="other")
                call("GET",BASE+"/receipts/"+ref,404)
                call("GET",ADMIN+"/orders",403,who="outsider")
                call("GET",ADMIN+"/orders",401,who="mother")
                call("POST",BASE+"/payhere/notify",415,who=None,json={})
                provider(ref,400,signature="A"*32)
                provider(ref,400,merchant="999")
                provider(ref,400,amount="789.99")
                provider(ref,400,currency="USD")
                provider(ref,400,code="-4")
                assert call("GET",ADMIN+f"/orders/{ref}/events",who="manager")==[]
                assert state(ref)["status"]=="pending"
                assert provider(ref,code="0")=={"accepted":True}
                assert state(ref)["status"]=="pending"
                clock.return_value=start+timedelta(days=1)
                with patch.object(entitlements,"apply_verified_purchase",side_effect=HTTPException(503,"synthetic failure")):
                    provider(ref,503)
                assert state(ref)["status"]=="pending"
                assert len(call("GET",ADMIN+f"/orders/{ref}/events",who="manager"))==1
                assert provider(ref)=={"accepted":True}
                assert provider(ref)=={"accepted":False}
                assert state(ref)["status"]=="paid"
                assert call("GET",BASE+"/receipts/"+ref)["sandbox"]
                assert call("GET",BASE+"/orders",who="other")["items"]==[]
                summaries=call("GET",ADMIN+"/orders",who="manager")["items"]
                assert datetime.fromisoformat(summaries[0]["starts_at"])==start+timedelta(days=7)
                assert call("GET",BASE+"/me")["plan"]=="trial"
                history=call("GET",ADMIN+f"/orders/{ref}/events",who="manager")
                assert len(history)==2 and "synthetic-card-field" not in str(history)
                provider(ref,payment="998877")
                assert state(ref)["review_required"]
                assert conn.exec_driver_sql("SELECT COUNT(*) FROM entitlement_periods WHERE source_ref=%s",
                                            ("paid:"+ref,)).scalar_one()==1

                clock.return_value=start+timedelta(days=7)
                assert call("GET",BASE+"/me")["plan"]=="premium"
                failed=checkout()["order_ref"]
                provider(failed,code="-2",payment="200")
                assert state(failed)["status"]=="failed"
                cancelled=checkout()["order_ref"]
                provider(cancelled,code="-1",payment="201")
                assert state(cancelled)["status"]=="cancelled"
                extension=checkout()["order_ref"]
                provider(extension,payment="202")
                assert datetime.fromisoformat(call("GET",BASE+"/me")["expires_at"])==start+timedelta(days=67)
                provider(failed,payment="200")
                assert state(failed)["status"]=="paid"
                assert datetime.fromisoformat(call("GET",BASE+"/me")["expires_at"])==start+timedelta(days=97)
                provider(extension,code="-3",payment="202")
                assert state(extension)["status"]=="chargeback" and state(extension)["review_required"]

                transport=MagicMock()
                res=lambda data:httpx.Response(200,json=data,request=httpx.Request("GET","https://sandbox.payhere.lk"))
                transport.post.return_value=res({"access_token":"synthetic-token","scope":"SANDBOX"})
                transport.get.return_value=res({"status":1,"data":[{
                    "payment_id":112233,"order_id":ref,"status":"REFUNDED","currency":"LKR","amount":790,
                    "customer":{"email":"do-not-store@example.com"},"payment_method":{"card_no":"masked-fixture"},
                }]})
                retrieval=ADMIN+f"/orders/{ref}/retrieve-reversals"
                call("POST",retrieval,403,who="outsider")
                with patch.object(payhere.httpx,"Client") as factory:
                    factory.return_value.__enter__.return_value=transport
                    assert call("POST",retrieval,who="manager")["recorded"]
                    assert call("POST",retrieval,who="manager")["recorded"]
                    assert transport.post.call_args.args[0]=="https://sandbox.payhere.lk/merchant/v1/oauth/token"
                    assert transport.get.call_args.args[0]=="https://sandbox.payhere.lk/merchant/v1/payment/search"
                assert state(ref)["status"]=="refunded" and state(ref)["review_required"]
                assert call("GET",BASE+"/receipts/"+ref)["status"]=="refunded"
                events=call("GET",ADMIN+f"/orders/{ref}/events",who="manager")
                assert sum(event["source"]=="retrieval" for event in events)==1
                assert all("customer" not in event and "card_no" not in event for event in events)
                assert conn.exec_driver_sql("SELECT COUNT(*) FROM audit_log WHERE action='billing.reversal_retrieved'").scalar_one()==1
                assert len(call("GET",ADMIN+"/orders?review_only=true",who="manager")["items"])==2
                call("GET",ADMIN+"/usage",who="manager")
                assert datetime.fromisoformat(call("GET",BASE+"/me")["expires_at"])==start+timedelta(days=97)
                assert checkout(who="other")["status"]=="pending"
            print("PASS sandbox signatures, tamper rejection, owner access, atomic grants, replay, delayed status, extensions and reversal review.")
        finally:
            app.dependency_overrides.pop(get_db,None)
            outer.rollback()


if __name__=="__main__":
    run()
