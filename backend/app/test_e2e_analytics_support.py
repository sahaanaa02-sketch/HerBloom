"""A13 integration tests. All test data is rolled back."""
from datetime import datetime, time, timedelta
from io import BytesIO
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.e2e_fixtures import ADMIN_EMAIL, MOTHER_EMAIL
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.admin import AdminPermission, AdminRole, AdminUser
from app.models.user import User
from app.routers.admin_2fa import create_admin_access_token
from app.services.auth_service import create_access_token
from app.services.recovery_rules import local_today
from app.services.user_privacy import ownership_verified


def run():
    authorize_e2e_launcher()
    preflight()
    from app.main import app

    with engine.connect() as connection:
        transaction=connection.begin()
        active=None

        def db():
            return active

        app.dependency_overrides[get_db]=db
        client=TestClient(app)
        try:
            with Session(bind=connection,join_transaction_mode="create_savepoint") as session:
                manager=session.scalar(select(AdminUser).where(AdminUser.email==ADMIN_EMAIL))
                keys=("analytics.view","support.view","support.reply","support.manage")
                permissions={}
                for key in keys:
                    permission=session.scalar(select(AdminPermission).where(AdminPermission.key==key))
                    permissions[key]=permission or AdminPermission(key=key)
                manager.roles.append(AdminRole(name="a13_full",permissions=list(permissions.values())))
                viewer=AdminUser(name="Synthetic viewer",email="a13-viewer@example.com",password_hash="synthetic",
                                 active=True,totp_enabled=True,
                                 roles=[AdminRole(name="a13_viewer",permissions=[permissions["support.view"]])])
                session.add(viewer)
                session.flush()
                manager_id,viewer_id=manager.id,viewer.id
                owner=session.scalar(select(User.id).where(User.email==MOTHER_EMAIL))
                ownership_verified(session)
                session.commit()

            today=local_today()
            start=today-timedelta(days=today.weekday()+35)
            stamp=datetime.combine(start,time(12))
            users=[]
            for n in range(15):
                key=f"a13_synthetic_{n}"
                user=connection.exec_driver_sql(
                    "INSERT INTO users(username,full_name,email,hashed_password,role,is_active,created_at,activated_at_utc) "
                    "VALUES (%s,%s,%s,'synthetic','MOTHER',1,%s,%s)",
                    (key,key,key+"@example.com",stamp,stamp),
                ).lastrowid
                users.append(user)
            article=connection.exec_driver_sql("SELECT id FROM articles WHERE published=1 ORDER BY id LIMIT 1").scalar_one()
            exercise=connection.exec_driver_sql("SELECT id FROM recovery_exercises ORDER BY id LIMIT 1").scalar_one()
            connection.exec_driver_sql("UPDATE articles SET title_en='=Synthetic formula guard' WHERE id=%s",(article,))
            for n,user in enumerate(users):
                if n<5:
                    for feature,id,hits in (("login",0,1),("article",article,2),("scan",0,3)):
                        connection.exec_driver_sql(
                            "INSERT INTO mother_engagement(user_id,activity_day,feature,resource_id,hits) VALUES (%s,%s,%s,%s,%s)",
                            (user,start+timedelta(days=8),feature,id,hits),
                        )
                    connection.exec_driver_sql(
                        "INSERT INTO exercise_sessions(user_id,exercise_id,feeling,pain,bleeding,pelvic_heaviness,note,completed_at)"
                        " VALUES (%s,%s,'ok',0,0,0,'private fixture',%s)",
                        (user,exercise,stamp+timedelta(days=8)),
                    )
                if n<4:
                    connection.exec_driver_sql(
                        "INSERT INTO mother_engagement(user_id,activity_day,feature,resource_id) VALUES (%s,%s,'chat',0)",
                        (user,start+timedelta(days=9)),
                    )
                if n<10:
                    connection.exec_driver_sql(
                        "INSERT INTO entitlement_periods(user_id,plan_code,source_ref,starts_at_utc,ends_at_utc)"
                        " VALUES (%s,'trial',%s,%s,%s)",(user,f"a13-trial-{user}",stamp+timedelta(days=1),stamp+timedelta(days=8)),
                    )
                if n<5:
                    order=connection.exec_driver_sql(
                        "INSERT INTO billing_orders(user_id,order_ref,checkout_key,merchant_id,amount_lkr,currency,status,created_at_utc,verified_at_utc)"
                        " VALUES (%s,%s,%s,'000',790,'LKR','paid',%s,%s)",
                        (user,f"a13-order-{n}",f"a13-test-{n}",stamp+timedelta(days=2),stamp+timedelta(days=3)),
                    ).lastrowid
                    connection.exec_driver_sql(
                        "INSERT INTO billing_payment_events(order_id,source,provider_status,provider_payment_id,received_at_utc) "
                        " VALUES (%s,'notify','cancelled',%s,%s)",(order,str(n+1),stamp+timedelta(days=2)),
                    )

            tokens={"manager":create_admin_access_token(manager_id),"viewer":create_admin_access_token(viewer_id),
                    "owner":create_access_token(owner,"MOTHER"),"other":create_access_token(users[-1],"MOTHER")}

            def call(method,path,status=200,role="manager",raw=False,**kwargs):
                nonlocal active
                headers={"Authorization":"Bearer "+tokens[role],"Idempotency-Key":str(uuid4())} if role else {}
                with Session(bind=connection,join_transaction_mode="create_savepoint") as active:
                    response=client.request(method,path,headers=headers,**kwargs)
                assert response.status_code==status,(path,response.status_code,response.text[:300])
                return response.text if raw else response.json()

            analytics="/api/admin/analytics"
            assert call("GET",analytics,403,"viewer")
            call("GET",analytics+"/export.csv",401,"owner")
            call("GET",analytics,422,params={"start":today,"end":start})
            span={"start":start,"end":start+timedelta(days=10)}
            result=call("GET",analytics,params=span)
            assert result["daily"][8]["count"]==5 and result["daily"][9]["count"] is None
            assert result["weekly"][1]["count"]==5
            assert result["features"]["Meal scans"]==15 and result["features"]["AI messages"] is None
            assert result["articles"]==[{"title":"=Synthetic formula guard","count":10}]
            assert result["exercises"][0]["count"]==5
            assert result["retention"]==[{"cohort":start.isoformat(),"week":0,"size":15,"active":None},
                                         {"cohort":start.isoformat(),"week":1,"size":15,"active":5}]
            assert result["conversion"]=={"signup":15,"trial":10,"paid_after_trial":5}
            assert result["checkout_cancellations"]==5 and result["subscription_cancellations"] is None
            export=call("GET",analytics+"/export.csv",raw=True,params=span)
            assert "articles,'=Synthetic formula guard,10," in export
            assert "features,AI messages,," in export and "private fixture" not in export
            assert "@example.com" not in export and "a13_synthetic" not in str(result)
            call("GET",f"/articles/{article}",role="owner")
            assert connection.exec_driver_sql(
                "SELECT hits FROM mother_engagement WHERE user_id=%s AND activity_day=%s AND feature='article' AND resource_id=%s",
                (owner,today,article),
            ).scalar_one()==1

            image=BytesIO()
            Image.new("RGB",(1,1)).save(image,"PNG")
            with patch("app.routers.nutrition.scan_food",return_value={"items":[]}), \
                 patch("app.routers.chat.search_articles",return_value=[{"article_id":article,"title":"Synthetic","content":"Fixture"}]), \
                 patch("app.routers.chat.generate_answer",return_value="Synthetic AI answer"):
                call("POST","/nutrition/scan",role="owner",files={"file":("synthetic.png",image.getvalue(),"image/png")})
                call("POST","/chat/message",role="owner",json={"text":"Synthetic question","lang":"en"})
            recorded = connection.exec_driver_sql(
                "SELECT feature,hits FROM mother_engagement WHERE user_id=%s AND activity_day=%s AND feature IN ('article','chat','scan') ORDER BY feature",
                (owner,today),
            ).all()
            assert dict(recorded) == {"article":1,"chat":1,"scan":1}

            mother="/api/support/tickets"
            admin="/api/admin/support"
            data={"subject":"Question about app settings","message":"Synthetic ticket content","category":"technical"}
            call("POST",mother,401,None,json=data)
            call("POST",mother,422,"owner",json={**data,"user_id":users[-1]})
            ticket=call("POST",mother,201,"owner",json=data)
            id=ticket["id"]
            path=mother+"/"+str(id)
            detail=admin+"/tickets/"+str(id)
            call("GET",path,404,"other")
            assert call("GET",mother,role="other")["items"]==[]
            assert len(call("GET",admin+"/tickets",role="viewer",params={"search":"app settings","status":"open"})["items"])==1
            assert call("GET",admin+"/tickets",params={"search":"%"})["items"]==[]
            assert call("PATCH",detail,403,"viewer",json={"status":"closed"})
            call("POST",detail+"/replies",403,"viewer",json={"body":"Synthetic reply"})
            assert call("PATCH",detail,json={"status":"pending","assignee_admin_id":manager_id})["assignee_admin_id"]==manager_id
            call("POST",detail+"/replies",201,json={"body":"Synthetic reply"})
            public=call("GET",path,role="owner")
            assert public["replies"][0]["body"]=="Synthetic reply" and "admin_id" not in public["replies"][0]
            assert "user_id" not in public and "assignee_admin_id" not in public
            assert [item["status"] for item in public["status_history"]]==["open","pending"]
            call("PATCH",detail,json={"status":"closed"})
            call("POST",detail+"/replies",409,json={"body":"Closed reply"})
            history=call("GET",detail)["admin_history"]
            assert len(history)==3 and "Synthetic reply" not in str(history)

            faq={"question_en":"Synthetic question","question_ta":"சோதனை கேள்வி",
                 "answer_en":"Synthetic answer","answer_ta":"சோதனை பதில்","category":"account","sort_order":10}
            call("POST",admin+"/faqs",403,"viewer",json=faq)
            call("POST",admin+"/faqs",422,json={**faq,"answer_ta":" "})
            row=call("POST",admin+"/faqs",201,json=faq)
            endpoint=admin+"/faqs/"+str(row["id"])
            assert call("GET","/api/faqs",role=None)["items"]==[]
            call("PUT",endpoint,json={**faq,"sort_order":2,"answer_en":"Edited answer"})
            call("POST",endpoint+"/publication",json={"published":True})
            assert call("GET","/api/faqs",role=None)["items"][0]["answer"]=="Edited answer"
            assert call("GET","/api/faqs?language=ta",role=None)["items"][0]["answer"]==faq["answer_ta"]
            assert len(call("GET",admin+"/faqs?status=published&search=Synthetic")["items"])==1
            call("POST",endpoint+"/publication",json={"published":False})
            assert call("GET","/api/faqs?language=ta",role=None)["items"]==[]
            assert connection.exec_driver_sql("SELECT COUNT(*) FROM audit_log WHERE entity='faq' AND entity_id=%s",
                                            (str(row["id"]),)).scalar_one()==4
            print("PASS A13 authenticated analytics, minimum groups, CSV, ticket ownership, replies, permissions, audit and bilingual FAQ publication.")
        finally:
            app.dependency_overrides.pop(get_db,None)
            transaction.rollback()


if __name__=="__main__":
    run()
