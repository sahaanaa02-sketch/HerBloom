"""A8 read-model tests on guarded, rollback-only E2E fixtures."""
from datetime import datetime, time, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, get_db
from app.e2e_fixtures import ADMIN_EMAIL, MOTHER_EMAIL
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.admin import AdminPermission, AdminRole, AdminUser, AuditLog
from app.models.chat import SafetyEvent
from app.models.user import User
from app.models.wellbeing import WellbeingCheckin
from app.routers.admin_2fa import create_admin_access_token
from app.services import admin_overview as metrics, clinical_review as flow
from app.services.auth_service import create_access_token


def midnight(day, clock):
    return datetime.combine(day, time.min, metrics.COLOMBO).astimezone(clock).replace(tzinfo=None)


def verify_empty(admin):
    db_engine = create_engine("sqlite://")
    for model in (User, AdminUser, WellbeingCheckin, SafetyEvent, AuditLog):
        model.__table__.create(db_engine)
    with Session(db_engine) as db, patch.object(metrics, "database_clock", return_value=timezone.utc):
        connection = db.connection()
        connection.connection.driver_connection.create_function(
            "substring_index", 3, lambda value, delimiter, _: value.rsplit(delimiter, 1)[-1])
        connection.exec_driver_sql("ALTER TABLE users ADD COLUMN last_active_at DATETIME")
        data = metrics.overview(db, admin, None)
        assert all(data[key] == 0 for key in ("total_mothers", "active_mothers", "new_this_week",
                                               "active_this_week", "checkins_this_week", "reviews_pending",
                                               "reviews_overdue", "total_admins"))
        assert data["last_10_audit_entries"] == []
        assert len(data["safety_counts_by_week"]) == 4
        assert all(w["urgent"] == w["crisis"] == 0 for w in data["safety_counts_by_week"])
    db_engine.dispose()


def run():
    authorize_e2e_launcher()
    preflight()
    from app.main import app

    with engine.connect() as connection:
        transaction = connection.begin()
        active_session = None

        def get_session():
            return active_session

        app.dependency_overrides[get_db] = get_session
        try:
            with Session(bind=connection, join_transaction_mode="create_savepoint") as db:
                primary = db.scalar(select(AdminUser).where(AdminUser.email == ADMIN_EMAIL))
                admin_id = primary.id
                mother_id = db.scalar(select(User.id).where(User.email == MOTHER_EMAIL))
                permission = db.scalar(select(AdminPermission).where(AdminPermission.key == "overview.view"))
                if permission is None:
                    permission = AdminPermission(key="overview.view")
                least = AdminUser(name="Synthetic overview-only admin", email="a8-overview.e2e@example.com",
                                  password_hash="Synthetic token-only account", active=True, totp_enabled=True,
                                  roles=[AdminRole(name="synthetic_overview_only", permissions=[permission])])
                denied = AdminUser(name="Synthetic unprivileged admin", email="a8-denied.e2e@example.com",
                                   password_hash="Synthetic token-only account", active=True, totp_enabled=True)
                db.add_all([least, denied])
                db.flush()
                limited_id, denied_id = least.id, denied.id
                today = metrics.local_today()
                current_monday = today - timedelta(days=today.weekday())
                clock = metrics.database_clock(db)
                active_stamp = midnight(current_monday, timezone.utc)
                created_stamp = midnight(current_monday, clock)
                db.connection().exec_driver_sql(
                    "UPDATE users SET created_at=%s,last_active_at=%s WHERE id=%s",
                    (created_stamp,active_stamp,mother_id))
                db.add(WellbeingCheckin(user_id=mother_id, due_date=today + timedelta(days=397),
                                       submitted_on=today, answers={"private_text": "SECRET HEALTH MARKER"}))
                old_end = current_monday - timedelta(weeks=2) + timedelta(days=2)
                oldest = old_end - timedelta(days=old_end.weekday(), weeks=3)
                for day, kind in ((oldest - timedelta(days=1), "urgent"), (oldest,"urgent"),
                                  (oldest + timedelta(weeks=1),"crisis"), (old_end,"urgent"),
                                  (old_end + timedelta(days=1),"crisis"), (today,"urgent"), (today,"other")):
                    db.add(SafetyEvent(category=kind,created_at=midnight(day,clock)))
                reviews = flow.reflected(db, "content_reviews")
                publications = flow.reflected(db, "clinical_publications")
                for entity, eid, state, superseded in [
                    ("articles",991,"pending",None),("articles",992,"pending",flow.now()),
                    ("warning_signs",993,"pending",None),
                    ("articles",994,"approved",None),("articles",994,"approved",None),
                    ("articles",995,"approved",None),
                ]:
                    rid = db.execute(reviews.insert().values(entity=entity,entity_id=eid,submitted_by=admin_id,
                                     decision=state,superseded_at=superseded,revision_hash="a"*64,
                                     submitted_snapshot={"title_en":"Synthetic fixture"})).inserted_primary_key[0]
                    if state == "approved":
                        previous = db.scalar(select(publications.c.id).where(publications.c.entity_id==eid).limit(1))
                        due = today + timedelta(days=30) if previous else today - timedelta(days=1)
                        db.execute(publications.insert().values(entity=entity,entity_id=eid,series_key=str(eid),
                                   review_id=rid,published_by=admin_id,next_review_due=due,snapshot={}))
                for i in range(11):
                    db.add(AuditLog(admin_id=admin_id, entity="users" if i<10 else "SECRET ENTITY MARKER",
                                    action="users.deactivate" if i<10 else "SECRET ACTION MARKER",
                                    entity_id="SECRET ID MARKER", ip="127.0.0.3",
                                    before_json={"notes":"SECRET AUDIT MARKER"}))
                db.commit()

            client = TestClient(app)
            def get(token, status=200, **params):
                nonlocal active_session
                with Session(bind=connection, join_transaction_mode="create_savepoint") as active_session:
                    response = client.get("/api/admin/overview",headers={"Authorization":"Bearer "+token},params=params)
                assert response.status_code==status,(response.status_code,response.text[:350])
                return response

            token = create_admin_access_token(admin_id)
            get(create_admin_access_token(denied_id),403)
            get(create_access_token(mother_id,"MOTHER"),401)
            get(token,422,safety_date=(today + timedelta(days=1)).isoformat())
            get(token,422,safety_date="not-a-date")

            def count(sql, *args):
                return connection.exec_driver_sql(sql,args).scalar_one()

            result=get(token).json()
            assert result["total_mothers"]==count("SELECT COUNT(*) FROM users WHERE role='MOTHER'")
            assert result["active_mothers"]==count("SELECT COUNT(*) FROM users WHERE role='MOTHER' AND is_active=1")
            assert result["new_this_week"]==count("SELECT COUNT(*) FROM users WHERE role='MOTHER' AND created_at>=%s AND created_at<%s",
                                                  created_stamp, midnight(today+timedelta(days=1),clock))
            assert result["active_this_week"]==count("SELECT COUNT(*) FROM users WHERE role='MOTHER' AND is_active=1 AND last_active_at>=%s AND last_active_at<%s",
                                                     active_stamp,midnight(current_monday+timedelta(weeks=1),timezone.utc))
            assert result["checkins_this_week"]==count("SELECT COUNT(*) FROM wellbeing_checkins w JOIN users u ON u.id=w.user_id WHERE u.role='MOTHER' AND w.submitted_on BETWEEN %s AND %s",
                                                       current_monday,today)
            assert result["reviews_pending"]==2 and result["reviews_overdue"]==1
            limited=get(create_admin_access_token(limited_id)).json()
            assert limited["reviews_pending"]==limited["reviews_overdue"]==0
            assert result["stage2_enabled"] is False and "premium_subscribers" not in result
            with patch.object(settings,"STAGE2_ENABLED",True):
                optional=get(token).json()
                assert optional["stage2_enabled"] is True
                assert all(optional[k] is None for k in ("premium_subscribers","revenue_this_month","ai_cost_this_month"))
            assert len(result["last_10_audit_entries"])==10
            assert all(set(r)=={"id","entity","action","created_at"} for r in result["last_10_audit_entries"])
            assert "SECRET" not in str(result) and "127.0.0.3" not in str(result)
            filtered=get(token,safety_date=old_end.isoformat()).json()
            assert filtered["as_of"]==today.isoformat() and filtered["safety_as_of"]==old_end.isoformat()
            assert filtered["safety_counts_by_week"]==[
                {"week_start":(oldest + timedelta(weeks=i)).isoformat(),"urgent":u,"crisis":c}
                for i,(u,c) in enumerate([(1,0),(0,1),(0,0),(1,0)])]
            print("PASS authenticated aggregation vs SQL, permissions, review scope, privacy, chart dates and Stage 2 visibility")
            verify_empty(SimpleNamespace(roles=[]))
            print("PASS empty overview, audit list and all four zero-value week buckets")
        finally:
            transaction.rollback()
            app.dependency_overrides.clear()


if __name__ == "__main__":
    run()
