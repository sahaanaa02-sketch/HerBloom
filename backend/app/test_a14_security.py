"""A14 authentication, Admin route permission and hardening checks."""
from inspect import getclosurevars
import re

import jwt
import pyotp
import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import a14_demo
from app.a14_demo import new_credentials, provision
from app.database import engine, get_db
from app.e2e_fixtures import MOTHER_EMAIL, fixture_credentials, fixture_png
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.article import Article
from app.services import clinical_review
from app.portal_cors import PortalCORS
from app.seed.sync_admin_permissions import ROLE_PERMISSIONS


class SyntheticCredentials(dict):
    def __repr__(self):
        return "<private synthetic role credentials>"


def demo_email(role):
    name = role.replace("_", "-")
    return f"a14-security-{name}.e2e@example.com"


@pytest.fixture
def environment(monkeypatch):
    monkeypatch.setattr(a14_demo, "demo_email", demo_email)
    from app.config import settings
    monkeypatch.setattr(settings, "E2E_ADMIN_PASSWORD_ONLY", False)
    authorize_e2e_launcher()
    preflight()
    from app.main import app
    with engine.connect() as connection:
        outer=connection.begin()
        active=None

        def session():
            return active

        def call(method,path,token=None,**kwargs):
            nonlocal active
            headers=kwargs.pop("headers",{})
            if token:
                headers={**headers,"Authorization":"Bearer "+token}
            with Session(bind=connection,join_transaction_mode="create_savepoint") as active:
                return client.request(method,path,headers=headers,**kwargs)

        app.dependency_overrides[get_db]=session
        client=TestClient(app)
        try:
            creds=SyntheticCredentials(new_credentials())
            with Session(bind=connection,join_transaction_mode="create_savepoint") as db:
                accounts=provision(db,creds)
                article=db.scalar(select(Article.id).order_by(Article.id).limit(1))
                clinical_review.submit(db,"articles",article,accounts["content_editor"])
                review=db.connection().exec_driver_sql("SELECT MAX(id) FROM content_reviews").scalar_one()
                db.connection().exec_driver_sql(
                    "UPDATE content_reviews SET superseded_at=UTC_TIMESTAMP() WHERE id=%s",(review,))
                db.commit()
            yield app,call,creds,review
        finally:
            app.dependency_overrides.pop(get_db,None)
            outer.rollback()


def login(call,role,credentials):
    password=credentials[role]["password"]
    challenge=call("POST","/api/admin/auth/login",json={"email":demo_email(role),"password":password})
    assert challenge.status_code==200,challenge.status_code
    body=challenge.json()
    assert body["requires_2fa"] and "access_token" not in body
    assert call("GET","/api/admin/me",body["challenge_token"]).status_code==401
    code=pyotp.TOTP(credentials[role]["totp_secret"]).now()
    verified=call("POST","/api/admin/auth/2fa/verify",json={"challenge_token":body["challenge_token"],"code":code})
    assert verified.status_code==200,verified.status_code
    result=verified.json()
    token=result["access_token"]
    claims=jwt.decode(token,options={"verify_signature":False})
    assert claims["exp"]-claims["iat"]==3600
    assert call("POST","/api/admin/auth/2fa/verify",json={
        "challenge_token":body["challenge_token"],"code":code}).status_code==401
    return token


def admin_routes(routes):
    for route in routes:
        if isinstance(route,APIRoute) and route.path.startswith("/api/admin/"):
            yield route
        elif hasattr(route,"original_router"):
            yield from admin_routes(route.original_router.routes)


PUBLIC={
    "/api/admin/auth/login","/api/admin/auth/2fa/setup",
    "/api/admin/auth/2fa/verify","/api/admin/auth/accept-invite",
}
DYNAMIC={
    "get_admin_profile":"authenticated", "queue":"clinical_list","due":"clinical_list",
    "details":"clinical_record","approve":"clinical_record","changes":"clinical_record","publish":"clinical_record",
    "revise":"content.edit","rereview":"content.edit",
    "list_requests":"request_reader","data_request":"request_reader",
    "impact":"confirmer","confirm":"confirmer","reject":"confirmer",
    "test_deletion":"confirmer","download_ticket":"confirmer","download":"confirmer",
}
PARAMS={"resource":"announcements","entity":"articles","feature":"chat","reference":"a14-no-order",
        "action":"deactivate","section":"profile","page_type":"privacy","key":"water"}


def expectation(route, role):
    permissions=ROLE_PERMISSIONS[role]
    for dep in route.dependant.dependencies:
        if dep.call.__name__=="permission_checker":
            return getclosurevars(dep.call).nonlocals["permission_key"] in permissions
        if dep.call.__name__=="require_view":
            return bool({"billing.view","subscriptions.view"} & permissions)
    gate=DYNAMIC[route.endpoint.__name__]
    if gate=="authenticated":
        return True
    if gate=="confirmer":
        return role=="super_admin" and "data_requests.confirm" in permissions
    if gate=="request_reader":
        return "users.manage" in permissions or role=="super_admin"
    if gate=="clinical_list":
        return any(f"{group}.{intent}" in permissions for group in ("content","nutrition","safety")
                   for intent in ("view","edit","approve"))
    if gate=="clinical_record":
        if route.endpoint.__name__=="details":
            return bool({"content.view","content.edit","content.approve"} & permissions)
        return "content.approve" in permissions
    return gate in permissions


SESSION_MUTATIONS = {"/api/admin/auth/logout"}


def test_admin_route_matrix(environment):
    app,call,credentials,review=environment
    roles={role:login(call,role,credentials) for role in ROLE_PERMISSIONS}
    _,password,_=fixture_credentials()
    mother=call("POST","/auth/login",data={"username":MOTHER_EMAIL,"password":password})
    assert mother.status_code==200,mother.status_code
    mother_token=mother.json()["access_token"]
    route_count=0
    requests=0
    for route in admin_routes(app.routes):
        if route.path in PUBLIC | SESSION_MUTATIONS:
            continue
        fields=PARAMS if DYNAMIC.get(route.endpoint.__name__)!="clinical_record" else {**PARAMS,"id":str(review)}
        path=re.sub(r"\{([^}]+)\}",lambda m:fields.get(m[1],"900000001"),route.path_format)
        for method in route.methods:
            route_count+=1
            payload={"comment":"Synthetic denied probe"} if route.endpoint.__name__=="changes" else (
                {"token":"A"*43} if route.endpoint.__name__=="download" else {})
            kwargs={"json":payload} if method in {"POST","PATCH","PUT","DELETE"} else {}
            assert call(method,path,**kwargs).status_code in (401,403),(method,path,"anonymous")
            assert call(method,path,mother_token,**kwargs).status_code in (401,403),(method,path,"mother")
            requests+=2
            for role,token in roles.items():
                result=call(method,path,token,**kwargs)
                expected=expectation(route,role)
                # Authorized contract probes may fail validation, find no record, or hit a disabled external gate.
                if expected is False:
                    assert result.status_code==403,(method,path,role,result.status_code)
                else:
                    assert result.status_code not in (401,403,405,500) and result.status_code<510,(method,path,role,result.status_code)
                requests+=1
    assert route_count==sum(1 for path,operations in app.openapi()["paths"].items()
                             if path.startswith("/api/admin/") and path not in PUBLIC | SESSION_MUTATIONS
                             for method in operations if method in {"get","post","put","patch","delete"})
    print(f"Admin role/auth matrix: {route_count} protected operations; {requests} requests.")


def test_login_limits_and_redaction(environment):
    _,call,credentials,_=environment
    password="SYNTHETIC-REDACTION-"+"x"*130
    invalid=call("POST","/api/admin/auth/login",json={"email":demo_email("support"),"password":password})
    assert invalid.status_code==422 and "SYNTHETIC-REDACTION" not in invalid.text
    for expected in (401,401,401,401,429):
        assert call("POST","/api/admin/auth/login",json={
            "email":demo_email("support"),"password":"synthetic-wrong-password"}).status_code==expected
    assert call("POST","/api/admin/auth/login",json={
        "email":demo_email("support"),"password":credentials["support"]["password"]}).status_code==429
    for _ in range(30):
        assert call("POST","/auth/login",data={"username":"a14-unknown@example.com","password":"synthetic"}).status_code==401
    assert call("POST","/auth/login",data={"username":"a14-unknown@example.com","password":"synthetic"}).status_code==429
    assert call("POST","/api/admin/auth/2fa/setup",json={"challenge_token":"synthetic-invalid"}).status_code==401
    assert call("POST","/api/admin/auth/2fa/verify",json={"challenge_token":"synthetic-invalid","code":"000000"}).status_code==401


def test_media_content_and_headers(environment,monkeypatch,tmp_path):
    _,call,credentials,_=environment
    from app.routers import admin_media
    monkeypatch.setattr(admin_media,"UPLOAD_DIR",tmp_path.resolve())
    token=login(call,"super_admin",credentials)
    fake=b"\x89PNG\r\n\x1a\n<script>fake</script>"
    response=call("POST","/api/admin/media",token,files={"file":("fake.png",fake,"image/png")})
    assert response.status_code==415 and not list(tmp_path.iterdir())
    response=call("POST","/api/admin/media",token,files={"file":("valid.png",fixture_png(),"image/png")})
    assert response.status_code==201,response.status_code
    media_id=response.json()["item"]["id"] if "item" in response.json() else response.json()["id"]
    url=f"/api/admin/media/{media_id}/file"
    assert call("GET",url).status_code==401
    result=call("GET",url,token)
    assert result.status_code==200 and result.content==fixture_png()
    assert result.headers["x-content-type-options"]=="nosniff"
    assert result.headers["content-security-policy"]=="sandbox; default-src 'none'"
    assert result.headers["content-disposition"].startswith("attachment;")


def test_hosted_cors_isolation():
    api=FastAPI()
    api.add_middleware(PortalCORS,admins=["https://admin.example.com"],mothers=["https://mother.example.com"])

    def endpoint():
        return {"ok": True}

    api.add_api_route("/api/admin/example",endpoint)
    api.add_api_route("/articles",endpoint)
    client=TestClient(api)

    def preflight_request(path,origin):
        return client.options(path,headers={"Origin":origin,"Access-Control-Request-Method":"GET",
                                            "Access-Control-Request-Headers":"authorization"})

    a,m="https://admin.example.com","https://mother.example.com"
    assert preflight_request("/api/admin/example",a).headers["access-control-allow-origin"]==a
    assert preflight_request("/api/admin/example",m).status_code==400
    assert preflight_request("/api/admin/example","https://admin.example.com.evil.example").status_code==400
    assert preflight_request("/articles",m).headers["access-control-allow-origin"]==m
    assert preflight_request("/articles",a).status_code==400


def test_provider_throttles(environment,monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from fastapi import HTTPException
    from app.routers import admin_nutrition
    from app.services import ai_monitor, rate_limits

    _,call,credentials,_=environment
    token=login(call,"content_editor",credentials)
    enforce=rate_limits.enforce

    def small_limit(db,bucket,limit,minutes=1):
        cap=2 if bucket.startswith(("usda:","provider:")) else limit
        return enforce(db,bucket,cap,minutes)

    monkeypatch.setattr(rate_limits,"enforce",small_limit)
    provider=AsyncMock(return_value={"foods":[]})
    monkeypatch.setattr(admin_nutrition,"usda_request",provider)
    path="/api/admin/usda/search"
    for expected in (200,200,429):
        result=call("GET",path,token,params={"q":"Synthetic"})
        assert result.status_code==expected
    assert provider.await_count==2

    with engine.connect() as connection:
        transaction=connection.begin()
        try:
            monkeypatch.setattr(ai_monitor,"SessionLocal",
                                lambda:Session(bind=connection,join_transaction_mode="create_savepoint"))
            runtime=SimpleNamespace(feature="chat",enabled=True,model_name="synthetic",daily_limit_free=None)
            monkeypatch.setattr(ai_monitor,"runtime",lambda *args:runtime)
            monkeypatch.setattr(ai_monitor,"approved_models",lambda:{"synthetic"})
            for _ in range(2):
                assert ai_monitor.provider_runtime("chat",900000001) is runtime
            with pytest.raises(HTTPException) as blocked:
                ai_monitor.provider_runtime("chat",900000001)
            assert blocked.value.status_code==429
        finally:
            transaction.rollback()


def test_scan_photo_privacy_and_upload_size(environment):
    from io import BytesIO
    from PIL import Image, PngImagePlugin
    from fastapi import HTTPException
    from app.routers.nutrition import clean_scan_image

    _,call,_,_=environment
    stream=BytesIO()
    info=PngImagePlugin.PngInfo()
    info.add_text("Location","synthetic-metadata-test")
    Image.new("RGB",(3,2),"red").save(stream,format="PNG",pnginfo=info)
    result=clean_scan_image(stream.getvalue(),"image/png")
    with Image.open(BytesIO(result)) as safe:
        assert safe.size==(3,2) and "Location" not in safe.info
    with pytest.raises(HTTPException) as blocked:
        clean_scan_image(stream.getvalue(),"image/jpeg")
    assert blocked.value.status_code==422
    response=call("POST","/api/admin/media",headers={"Content-Length":"20000000"},content=b"")
    assert response.status_code==413
    assert response.headers["cache-control"]=="no-store"


def test_admin_challenge_rejects_wrong_and_expired_codes(environment):
    from datetime import datetime, timedelta, timezone

    from app.services.admin_security import admin_settings

    _, call, credentials, _ = environment
    role = "support"
    challenge = call("POST", "/api/admin/auth/login", json={
        "email": demo_email(role), "password": credentials[role]["password"],
    })
    assert challenge.status_code == 200
    data = challenge.json()
    assert data["requires_2fa"] and "access_token" not in data
    token = data["challenge_token"]
    assert call("GET", "/api/admin/me", token).status_code == 401
    verifier = pyotp.TOTP(credentials[role]["totp_secret"])
    now = datetime.now(timezone.utc)
    neighboring_codes = {verifier.at(now + timedelta(seconds=30 * offset)) for offset in range(-2, 3)}
    wrong = next(code for code in ("000000", "111111", "222222", "333333", "444444", "555555")
                 if code not in neighboring_codes)
    denied = call("POST", "/api/admin/auth/2fa/verify", json={"challenge_token": token, "code": wrong})
    assert denied.status_code == 401 and "access_token" not in denied.json()
    assert "authenticator code" in denied.json()["detail"]

    claims = jwt.decode(token, options={"verify_signature": False})
    claims.update(iat=now - timedelta(minutes=6), exp=now - timedelta(minutes=1))
    expired = jwt.encode(claims, admin_settings.ADMIN_JWT_SECRET, algorithm="HS256")
    denied = call("POST", "/api/admin/auth/2fa/verify",
                  json={"challenge_token": expired, "code": verifier.now()})
    assert denied.status_code == 401 and "access_token" not in denied.json()
    assert "expired login challenge" in denied.json()["detail"]
