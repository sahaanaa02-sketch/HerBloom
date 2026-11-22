"""A10 tests using guarded transactional data and mocked Gemini transports."""
import asyncio
from datetime import timedelta
from types import SimpleNamespace as NS
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.e2e_fixtures import ADMIN_EMAIL, MOTHER_EMAIL
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.admin import AdminPermission, AdminRole, AdminUser, AuditLog
from app.models.user import User
from app.routers.admin_2fa import create_admin_access_token
from app.services import ai_gateway, ai_monitor as monitor, food_scanner
from app.services.auth_service import create_access_token


def run():
    authorize_e2e_launcher()
    preflight()
    from app.main import app
    provider={"GEMINI_MODEL":"gemini-existing","A10_APPROVED_MODELS":"gemini-synthetic-a, gemini-synthetic-b","GEMINI_API_KEY":"mock-only"}
    def config(key, default=None):
        return provider.get(key,default)

    with engine.connect() as conn:
        tx=conn.begin()
        active=None
        def db():
            return active
        def isolated():
            return Session(bind=conn,join_transaction_mode="create_savepoint")
        app.dependency_overrides[get_db]=db
        monitor.clear_cache()
        try:
            with isolated() as s:
                admin_id=s.scalar(select(AdminUser.id).where(AdminUser.email==ADMIN_EMAIL))
                mother_id=s.scalar(select(User.id).where(User.email==MOTHER_EMAIL))
                perm=s.scalar(select(AdminPermission).where(AdminPermission.key=="ai.view"))
                viewer=AdminUser(email="a10-viewer.e2e@example.com",name="Synthetic A10 viewer",active=True,
                                 totp_enabled=True,password_hash="Synthetic token-only account",
                                 roles=[AdminRole(name="synthetic_a10_viewer",permissions=[perm])])
                other=User(username="a10_other",email="a10-other.e2e@example.com",full_name="Synthetic A10 mother",
                           role="MOTHER",hashed_password="Synthetic token-only account",is_active=True)
                s.add_all([viewer,other]);s.flush()
                vid,oid=viewer.id,other.id
                s.commit()
            roles={"manager":create_admin_access_token(admin_id),"viewer":create_admin_access_token(vid),
                   "mother":create_access_token(mother_id,"MOTHER"),"other":create_access_token(oid,"MOTHER")}
            client=TestClient(app)
            def call(method,path,status=200,role="manager",**kw):
                nonlocal active
                with isolated() as active:
                    response=client.request(method,path,headers={"Authorization":"Bearer "+roles[role],"Idempotency-Key":str(uuid4())},**kw)
                assert response.status_code==status,(path,response.status_code,response.text[:200] if "/chat/" not in path else "")
                return response.json()
            def api(method,path,status=200,role="manager",**kw):
                return call(method,"/api/admin/ai"+path,status,role,**kw)
            payload={"enabled":True,"model_name":"gemini-synthetic-a","max_output_tokens":100,"temperature":0.3,
                     "daily_limit_free":None,"daily_limit_premium":30,"price_in_per_m":2,"price_out_per_m":4}
            model_args=[]
            fake=NS(text="Synthetic answer",usage_metadata=NS(prompt_token_count=1000,candidates_token_count=500))
            def generate(**kw):
                model_args.append(kw)
                return fake
            mock_response={"candidates":[{"content":{"parts":[{"text":'{"items":[{"name":"rice","estimated_grams":120,"confidence":"high"}]}' }]}}],
                           "usageMetadata":{"promptTokenCount":20,"candidatesTokenCount":10}}
            class MockHTTP:
                def __init__(self,**kwargs): pass
                async def __aenter__(self): return self
                async def __aexit__(self,*args): return None
                async def post(self,*args,**kwargs):
                    return NS(status_code=200,json=lambda:mock_response)

            with patch.object(monitor,"external_setting",side_effect=config), patch.object(
                monitor,"SessionLocal",side_effect=isolated
            ),patch.object(ai_gateway,"external_setting",side_effect=config),patch.object(
                ai_gateway.genai,"Client",return_value=MagicMock(__enter__=MagicMock(return_value=NS(models=NS(generate_content=generate))))
            ) as sdk_client,patch.object(food_scanner,"external_setting",side_effect=config),patch.object(
                food_scanner.httpx,"AsyncClient",MockHTTP
            ):
                assert api("GET","/usage")["totals"]["calls"]==0
                api("GET","/settings",401,"mother")
                api("PUT","/settings/chat",403,"viewer",json=payload)
                api("PUT","/settings/chat",422,json={**payload,"model_name":"unapproved"})
                api("PUT","/settings/plan",422,json=payload)
                api("PUT","/settings/chat",json=payload)
                assert monitor.runtime("chat").model_name=="gemini-synthetic-a"
                conn.exec_driver_sql("UPDATE ai_settings SET model_name='gemini-synthetic-b' WHERE feature='chat'")
                assert monitor.runtime("chat").model_name=="gemini-synthetic-a"
                with patch.object(monitor,"monotonic",return_value=monitor._cache["chat"][0]+1):
                    assert monitor.runtime("chat").model_name=="gemini-synthetic-b"
                first=api("POST","/prompts/chat",201,json={"system_prompt":"Synthetic style one"})
                second=api("POST","/prompts/chat",201,json={"system_prompt":"Synthetic style two"})
                api("POST",f"/prompts/chat/{first['id']}/activate",403,"viewer")
                api("POST",f"/prompts/chat/{second['id']}/activate")
                assert monitor.runtime("chat").prompt=="Synthetic style two"
                api("POST",f"/prompts/chat/{first['id']}/activate")
                assert monitor.runtime("chat").prompt=="Synthetic style one"
                assert sum(r["active"] for r in api("GET","/prompts/chat")["items"])==1
                passages=[{"title":"Existing reviewed source fixture","article_id":1,"content":"Synthetic answer"}]
                with patch("app.routers.chat.search_articles",return_value=passages):
                    message=call("POST","/chat/message",200,"mother",json={"text":"Private synthetic question","lang":"en"})
                sent=model_args[-1]
                assert sent["model"]=="gemini-synthetic-b" and sent["config"].max_output_tokens==100
                assert "Synthetic style one" in sent["config"].system_instruction and "Never diagnose" in sent["config"].system_instruction
                assert message["text"]=="Synthetic answer"
                call("GET", f"/chat/sessions/{message['session_id']}", 404, "other")
                assert sdk_client.call_args.kwargs["http_options"].timeout == 20_000
                assert sdk_client.call_args.kwargs["http_options"].retry_options.attempts == 1
                sdk_client.return_value.__exit__.assert_called()
                with patch.object(ai_gateway.genai,"Client",side_effect=TimeoutError("Synthetic provider timeout")):
                    try:ai_gateway.generate_answer("Private failure fixture","en",passages,user_id=mother_id)
                    except monitor.AIUnavailable:pass
                    else:raise AssertionError("Provider failure was not handled")
                assert ai_gateway.generate_weekly_summary({},user_id=mother_id)=="Synthetic answer"
                chat_stats=api("GET","/usage",params={"feature":"chat"})["totals"]
                assert chat_stats["calls"]==2 and chat_stats["success_rate"]==50 and chat_stats["priced_calls"]==1
                assert chat_stats["input_tokens"]==1000 and chat_stats["output_tokens"]==500
                assert abs(chat_stats["cost_usd"]-0.004)<1e-10
                print("PASS mocked provider success/failure, tokens/cost, approved model change, cache expiry, prompt rollback and safety rules")

                for corrected in (True,False):
                    scan=asyncio.run(food_scanner.scan_food(b"synthetic photo bytes","image/png",user_id=mother_id))
                    receipt=scan["scan_receipt"]
                    path="/nutrition/scan/review"
                    call("POST",path,404,"other",json={"receipt":receipt,"corrected":corrected})
                    call("POST",path,200,"mother",json={"receipt":receipt,"corrected":corrected})
                    call("POST",path,409,"mother",json={"receipt":receipt,"corrected":corrected})
                assert api("GET","/usage")["scanner"]=={"successful":2,"reviewed":2,"corrected":1,"correction_rate":50.0}
                api("GET","/usage",422,params={"start":"2000-01-01"})
                api("PUT","/settings/scan",json={**payload,"daily_limit_free":1})
                monitor.provider_runtime("scan",mother_id)
                try:monitor.provider_runtime("scan",mother_id)
                except monitor.AIUnavailable:pass
                else:raise AssertionError("Quota was exceeded")
                print("PASS scanner telemetry, owner binding and replay, date filters, and atomic free quota")

                path=f"/chat/messages/{message['id']}/feedback"
                call("POST",path,404,"other",json={"helpful":False,"share_content":True})
                call("POST",path,200,"mother",json={"helpful":False})
                record=api("GET","/feedback")["items"][0]
                aid=record["id"]
                assert "question" not in record and "answer" not in record
                detail=api("GET",f"/feedback/{aid}",role="viewer")
                assert not detail["shared"] and detail["question"] is None and detail["answer"] is None
                call("POST",path,200,"mother",json={"helpful":False,"share_content":True})
                detail=api("GET",f"/feedback/{aid}",role="viewer")
                assert detail["question"]=="Private synthetic question" and detail["answer"]=="Synthetic answer" and detail["sources"]
                api("PUT",f"/feedback/{aid}",403,"viewer",json={"status":"reviewed"})
                api("PUT",f"/feedback/{aid}",json={"status":"reviewed","reviewer_note":"Synthetic review note"})
                call("POST",path,200,"mother",json={"helpful":False,"share_content":False})
                detail=api("GET",f"/feedback/{aid}")
                assert detail["answer"] is None and detail["question"] is None and detail["status"]=="reviewed"
                call("POST",path,200,"mother",json={"helpful":True})
                api("GET",f"/feedback/{aid}",404)
                with isolated() as s:
                    actions=set(s.scalars(select(AuditLog.action)))
                    assert {"ai_settings.updated","prompt_versions.created","prompt_versions.activated","ai_feedback_reviews.updated"} <= actions
                    assert set(monitor.table(s,"ai_usage").c.keys())=={
                        "id","feature","model","input_tokens","output_tokens","est_cost_usd","success","latency_ms","created_at","scanner_corrected"}
                print("PASS negative feedback consent, ownership, withdrawal, manager permissions, audit and content-free telemetry schema")
        finally:
            tx.rollback()
            monitor.clear_cache()
            app.dependency_overrides.clear()


if __name__=="__main__":
    run()
