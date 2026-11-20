from app.services import analytics
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.article import Article
from app.models.mother_profile import MotherProfile
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.article import ArticleOut, ArticleList


router = APIRouter(
    prefix="/articles",
    tags=["Learn & Care"]
)

Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


# Get all published articles
@router.get("", response_model=ArticleList)
def list_articles(
    db: Db,
    user: CurrentUser,
    category: str | None = None,
    search: str | None = None,
):
    # Published means visible to users.
    # It does not mean medically reviewed.
    query = db.query(Article).filter(
        Article.publicly_visible
    )

    if category and category != "all":
        query = query.filter(
            Article.category == category
        )

    if search and search.strip():
        term = f"%{search.strip()}%"

        query = query.filter(
            or_(
                Article.title_en.ilike(term),
                Article.title_ta.ilike(term),
                Article.body_en.ilike(term),
                Article.body_ta.ilike(term),
            )
        )

    items = query.order_by(
        Article.id.desc()
    ).all()

    return {
        "items": items,
        "total": len(items),
    }


# Personalized articles based on postpartum week
@router.get(
    "/for-my-week",
    response_model=list[ArticleOut]
)
def articles_for_my_week(
    db: Db,
    user: CurrentUser,
    limit: int = Query(
        default=3,
        ge=1,
        le=10
    ),
):
    if user.role != "MOTHER":
        raise HTTPException(
            status_code=403,
            detail="Only mothers can access personalized articles."
        )

    profile = (
        db.query(MotherProfile)
        .filter(MotherProfile.user_id == user.id)
        .first()
    )

    if not profile or not profile.baby_birth_date:
        return []

    days = (
        date.today() - profile.baby_birth_date
    ).days

    if days < 0:
        return []

    week = days // 7 + 1
    delivery = profile.delivery_type or "any"

    return (
        db.query(Article)
        .filter(
            Article.publicly_visible,
            or_(
                Article.min_week.is_(None),
                Article.min_week <= week
            ),
            or_(
                Article.max_week.is_(None),
                Article.max_week >= week
            ),
            or_(
                Article.first_baby_only.is_(False),
                profile.first_baby is True,
            ),
            Article.delivery_type.in_(
                ["any", delivery]
            ),
        )
        .order_by(
            Article.read_time.asc(),
            Article.id.asc()
        )
        .limit(limit)
        .all()
    )


# Get single article
@router.get(
    "/{article_id}",
    response_model=ArticleOut
)
def get_article(
    article_id: int,
    db: Db,
    user: CurrentUser,
):
    article = (
        db.query(Article)
        .filter(
            Article.id == article_id,
            Article.publicly_visible,
        )
        .first()
    )

    if not article:
        raise HTTPException(
            status_code=404,
            detail="Article not found."
        )

    if user.role == "MOTHER" and analytics.ready(db):
        analytics.record(db, user.id, "article", article.id)
        db.commit()
    return article