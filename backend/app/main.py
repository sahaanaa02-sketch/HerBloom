from contextlib import asynccontextmanager

from fastapi import FastAPI
from app.portal_cors import PortalCORS
from app.upload_limits import BoundedUploads
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import E2E_MODE, settings
from app.database import engine

# ==========================================
# Authentication
# ==========================================
from app.routers.auth import router as auth_router

# ==========================================
# Mother Onboarding and Profile
# ==========================================
from app.routers.onboarding import router as onboarding_router
from app.routers.profile import router as profile_router

# ==========================================
# Learn and Care
# ==========================================
from app.routers.articles import router as articles_router

# ==========================================
# Wellbeing and Recovery
# ==========================================
from app.routers.wellbeing import router as wellbeing_router
from app.routers.recovery import router as recovery_router

# ==========================================
# Mother Dashboard
# ==========================================
from app.routers.dashboard import router as dashboard_router
from app.routers.todos import router as todos_router
from app.routers.reminders import router as reminders_router

# ==========================================
# Nutrition and Anaemia
# ==========================================
from app.routers.nutrition import router as nutrition_router

# ==========================================
# Ask HerBloom AI Chatbot
# ==========================================
from app.routers.chat import router as chat_router

# ==========================================
# Weekly Summary
# ==========================================
from app.routers.reports import router as reports_router
from app.routers.entitlements import router as entitlements_router
from app.routers.admin_analytics import router as admin_analytics_router
from app.routers.support import router as support_router, admin_router as support_admin_router
from app.routers.billing import router as billing_router, admin_router as billing_admin_router

# ==========================================
# Admin Portal
# ==========================================
from app.routers.admin import router as admin_router

# ==========================================
# Admin Two-Factor Authentication
# ==========================================
from app.routers.admin_2fa import router as admin_2fa_router

# ==========================================
# Admin Media Management - NEW (Phase A2.3)
# ==========================================
from app.routers.admin_media import router as admin_media_router
from app.routers.admin_articles import router as admin_articles_router
from app.routers.admin_exercises import router as admin_exercises_router
from app.routers.admin_wellbeing import router as admin_wellbeing_router
from app.routers.admin_meal_ideas import router as admin_meal_ideas_router
from app.routers.admin_nutrition import router as admin_nutrition_router
from app.routers.safety import router as safety_router
from app.routers.clinical_review import router as clinical_review_router
from app.routers.admin_users import router as admin_users_router
from app.routers.admin_settings import router as admin_settings_router
from app.routers.admin_ai import router as admin_ai_router
from app.routers.notifications import admin_router as notifications_admin, mother_router as notifications_mother


# ==========================================
# FastAPI Application
# ==========================================
if E2E_MODE:
    from app.e2e_guard import require_e2e_launcher

    require_e2e_launcher()


@asynccontextmanager
async def e2e_lifespan(app: FastAPI):
    from app.e2e_guard import verify_e2e_startup

    verify_e2e_startup()
    yield


app = FastAPI(
    title="HerBloom API",
    description="Postpartum and C-section Recovery Support Platform",
    version="1.0.0",
    lifespan=e2e_lifespan if E2E_MODE else None,
)


# ==========================================
# CORS Configuration
# ==========================================
local_origins = [settings.E2E_FRONTEND_ORIGIN] if E2E_MODE else ["http://localhost:5173", "http://127.0.0.1:5173"]
app.add_middleware(BoundedUploads)
app.add_middleware(
    PortalCORS,
    admins=[settings.A14_ADMIN_ORIGIN] if settings.A14_HOSTED else local_origins,
    mothers=[settings.A14_MOTHER_ORIGIN] if settings.A14_HOSTED else local_origins,
)


# ==========================================
# Authentication Routes
# ==========================================
app.include_router(auth_router)


# ==========================================
# Mother Onboarding and Profile Routes
# ==========================================
app.include_router(onboarding_router)
app.include_router(profile_router)


# ==========================================
# Learn and Care Routes
# ==========================================
app.include_router(articles_router)


# ==========================================
# Wellbeing and Recovery Routes
# ==========================================
app.include_router(wellbeing_router)
app.include_router(recovery_router)


# ==========================================
# Mother Dashboard Routes
# ==========================================
app.include_router(dashboard_router)
app.include_router(todos_router)
app.include_router(reminders_router)


# ==========================================
# Nutrition and Anaemia Routes
# ==========================================
app.include_router(nutrition_router)


# ==========================================
# Ask HerBloom AI Chatbot Routes
# ==========================================
app.include_router(chat_router)


# ==========================================
# Weekly Summary Routes
# ==========================================
app.include_router(reports_router)
app.include_router(entitlements_router)
app.include_router(billing_router)
app.include_router(billing_admin_router)
app.include_router(admin_analytics_router)
app.include_router(support_router)
app.include_router(support_admin_router)


# ==========================================
# Admin Portal Routes
# ==========================================
app.include_router(admin_router)


# ==========================================
# Admin Two-Factor Authentication Routes
# ==========================================
app.include_router(admin_2fa_router)


# ==========================================
# Admin Media Management Routes - NEW
# ==========================================
app.include_router(admin_media_router)
app.include_router(admin_articles_router)
app.include_router(admin_exercises_router)
app.include_router(admin_wellbeing_router)
app.include_router(admin_meal_ideas_router)
app.include_router(admin_nutrition_router)
app.include_router(safety_router)
app.include_router(clinical_review_router)
app.include_router(admin_users_router)
app.include_router(admin_settings_router)
app.include_router(admin_ai_router)
app.include_router(notifications_admin)
app.include_router(notifications_mother)


@app.exception_handler(RequestValidationError)
async def protect_account_link_validation(request, error):
    path = request.url.path
    account_links = {"/auth/forgot-password", "/auth/reset-password", "/auth/verify-email", "/api/admin/auth/accept-invite"}
    if path in account_links or (path.startswith("/api/admin/data-requests/") and path.endswith("/download")):
        return JSONResponse({"detail": "Invalid account or download request."}, status_code=422,
                            headers={"Cache-Control": "no-store"})
    # Keep field location and error type, without echoing submitted values.
    allowed = ("type", "loc", "msg")
    return JSONResponse(status_code=422, content={"detail": [
        {key: issue[key] for key in allowed if key in issue}
        for issue in error.errors()
    ]})


@app.exception_handler(SQLAlchemyError)
async def database_error(request, error):
    # Database exception messages themselves can embed data even with parameters hidden.
    return JSONResponse({"detail": "The request could not be completed."}, status_code=500)



# ==========================================
# Home
# ==========================================
@app.get("/", tags=["General"])
def home():
    return {
        "application": "HerBloom",
        "message": "Welcome to HerBloom API!",
        "status": "running",
    }


# ==========================================
# API Health
# ==========================================
@app.get("/health", tags=["General"])
def health_check():
    return {
        "status": "healthy",
    }


if E2E_MODE:
    @app.get("/health/e2e", include_in_schema=False)
    def e2e_health():
        return {"mode": "e2e", "status": "ready"}


# ==========================================
# Database Health
# ==========================================
@app.get("/health/database", tags=["Development"])
def database_health_check():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "status": "connected",
            "database": "MySQL",
        }

    except SQLAlchemyError:
        return {
            "status": "disconnected",
            "database": "MySQL",
        }
