
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import column, inspect, select, table
from sqlalchemy.orm import Session
from sqlalchemy.dialects.mysql import insert

from app.database import get_db
from app.models.user import User
from app.models.article import Article
from app.models.mother_profile import MotherProfile
from app.models.chat import (
    ChatSession,
    ChatMessage,
    ChatFeedback,
    SafetyEvent,
)
from app.routers.auth import get_current_user
from app.schemas.chat import (
    ChatRequest,
    FeedbackRequest,
    ConsentRequest,
)
from app.services.chat_safety import check_text
from app.services import ai_monitor as monitor
from app.services import analytics, free_quota
from app.services.safety_content import safety_message
from app.services.article_search import reviewed, search_articles
from app.services.ai_gateway import (
    generate_answer,
    AIUnavailable,
)


router = APIRouter(
    prefix="/chat",
    tags=["Ask HerBloom AI"],
)


def require_mother(
    user: User = Depends(get_current_user),
):
    if user.role != "MOTHER":
        raise HTTPException(
            status_code=403,
            detail="Mother access required.",
        )
    return user


def get_own_session(db, user_id, session_id):
    session = db.scalar(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
        )
    )

    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Chat session not found.",
        )

    return session


def serialize_message(message):
    return {
        "id": message.id,
        "role": message.role,
        "text": message.content,
        "type": message.message_type,
        "lang": message.language,
        "sources": message.sources or [],
        "created_at": (
            message.created_at.isoformat()
            if message.created_at else None
        ),
    }


def fallback(lang):
    if lang == "ta":
        return (
            "இதற்கான மதிப்பாய்வு செய்யப்பட்ட தகவல் "
            "என்னிடம் இல்லை. உங்கள் மருத்துவர் "
            "அல்லது மருத்துவ மாதுவிடம் கேளுங்கள்."
        )

    return (
        "I don't have reviewed information on that. "
        "Please ask your doctor or midwife."
    )


def ai_error(lang):
    if lang == "ta":
        return (
            "AI சேவை தற்போது கிடைக்கவில்லை. "
            "சிறிது நேரம் கழித்து முயற்சிக்கவும்."
        )

    return (
        "The AI service is temporarily unavailable. "
        "Please try again."
    )


@router.get("/sessions")
def list_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    sessions = db.scalars(
        select(ChatSession)
        .where(ChatSession.user_id == user.id)
        .order_by(ChatSession.id.desc())
    ).all()

    return [
        {
            "id": session.id,
            "title": session.title,
            "created_at": session.created_at,
        }
        for session in sessions
    ]


@router.get("/sessions/{session_id}")
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    session = get_own_session(
        db, user.id, session_id
    )

    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.id.asc())
    ).all()

    details = {}
    if monitor.ready(db):
        reviews = monitor.table(db,"ai_feedback_reviews")
        f = ChatFeedback.__table__
        for mid, helpful, shared in db.execute(select(f.c.message_id,f.c.helpful,reviews.c.share_content)
                .select_from(f.outerjoin(reviews,reviews.c.feedback_id==f.c.id))
                .where(f.c.user_id==user.id,f.c.message_id.in_([m.id for m in messages]))):
            details[mid] = {"feedback":helpful,"feedback_shared":bool(shared and not helpful)}
    return {
        "id": session.id,
        "title": session.title,
        "messages": [
            {**serialize_message(message), **details.get(message.id,{})}
            for message in messages
        ],
    }


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    session = get_own_session(
        db, user.id, session_id
    )

    messages = db.scalars(
        select(ChatMessage).where(
            ChatMessage.session_id == session.id
        )
    ).all()

    message_ids = [message.id for message in messages]

    if message_ids:
        feedback_rows = db.scalars(
            select(ChatFeedback).where(
                ChatFeedback.message_id.in_(message_ids)
            )
        ).all()

        for feedback in feedback_rows:
            db.delete(feedback)

    for message in messages:
        db.delete(message)

    db.delete(session)
    db.commit()

    return {"message": "Conversation deleted."}


@router.get("/consent")
def get_consent(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    profile = db.scalar(
        select(MotherProfile).where(
            MotherProfile.user_id == user.id
        )
    )

    return {
        "enabled": bool(
            profile and profile.consent_ai_profile
        )
    }


@router.patch("/consent")
def update_consent(
    payload: ConsentRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    profile = db.scalar(
        select(MotherProfile).where(
            MotherProfile.user_id == user.id
        )
    )

    if profile is None:
        raise HTTPException(
            status_code=404,
            detail="Mother profile not found.",
        )

    profile.consent_ai_profile = payload.enabled
    db.commit()

    return {
        "enabled": profile.consent_ai_profile
    }


@router.post("/message")
def send_message(
    payload: ChatRequest,
    idempotency_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    question = payload.text.strip()
    lang = payload.lang

    if not question:
        raise HTTPException(
            status_code=422,
            detail="Question cannot be empty.",
        )

    # Validate ownership before processing any request
    # that refers to an existing session.
    session = None

    if payload.session_id is not None:
        session = get_own_session(
            db, user.id, payload.session_id
        )

    # 1. SAFETY FIRST - NO GEMINI CALL
    safety = check_text(question, lang, db=db)

    if safety:
        if "source" in {c["name"] for c in inspect(db.connection()).get_columns("safety_events")}:
            events = table("safety_events", column("category"), column("source"))
            db.execute(events.insert().values(category=safety["type"], source="chatbot"))
        else:
            db.add(SafetyEvent(category=safety["type"]))
        db.commit()

        # No user text or safety response stored in history.
        return {
            "id": None,
            "session_id": payload.session_id,
            "role": "assistant",
            "type": safety["type"],
            "text": safety["text"],
            "lang": lang,
            "sources": [],
        }

    # 2. VALIDATE OPTIONAL ARTICLE
    if payload.article_id is not None:
        article = db.get(Article, payload.article_id)

        if article is None or not reviewed(article):
            raise HTTPException(
                status_code=404,
                detail="Reviewed article not found.",
            )

    # 3. RETRIEVE REVIEWED PASSAGES
    passages = search_articles(
        db,
        question,
        lang,
        article_id=payload.article_id,
    )

    charge = None

    # 4. NO SOURCE = NO AI
    if not passages:
        result = {
            "type": "fallback",
            "text": safety_message(db, "no_info", lang, fallback(lang)),
            "sources": [],
        }

    else:
        # 5. OPTIONAL, LIMITED PERSONALIZATION
        profile = db.scalar(
            select(MotherProfile).where(
                MotherProfile.user_id == user.id
            )
        )

        profile_context = None

        if profile and profile.consent_ai_profile:
            week = None

            if profile.baby_birth_date:
                days = (
                    date.today() -
                    profile.baby_birth_date
                ).days

                if days >= 0:
                    week = days // 7 + 1

            profile_context = {
                "postpartum_week": week,
                "delivery_type": profile.delivery_type,
                "feeding_method": profile.feeding_method,
            }

        charge = free_quota.begin_request(db, user.id, "chat", idempotency_key)

        # 6. GEMINI ONLY AFTER SAFETY AND SEARCH
        try:
            answer = generate_answer(
                question,
                lang,
                passages,
                profile_context, db=db, user_id=user.id, entitlement_quota=charge is not None,
            )

            # Display only an intact reviewed passage, never model-authored medical text.
            normalized = " ".join(answer.split())
            source = next(
                (item for item in passages
                 if normalized and " ".join(item["content"].split()) == normalized),
                None,
            )
            if source is None:
                return {
                    "id": None,
                    "session_id": payload.session_id,
                    "role": "assistant",
                    "lang": lang,
                    "type": "fallback",
                    "text": safety_message(db, "no_info", lang, fallback(lang)),
                    "sources": [],
                }

            result = {
                "type": "answer",
                "text": source["content"],
                "sources": [{"article_id": source["article_id"], "title": source["title"]}],
            }

        except AIUnavailable:
            result = {
                "type": "error",
                "text": ai_error(lang),
                "sources": [],
            }

    # Do not save failed AI responses as conversations.
    if result["type"] == "error":
        return {
            "id": None,
            "session_id": payload.session_id,
            "role": "assistant",
            "lang": lang,
            **result,
        }

    # 7. CREATE SESSION IF NECESSARY
    if session is None:
        session = ChatSession(
            user_id=user.id,
            title=question[:100],
        )
        db.add(session)
        db.flush()

    question_message = ChatMessage(
        session_id=session.id, role="user", content=question, language=lang, message_type="question",
    )
    db.add(question_message)

    assistant_message = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=result["text"],
        language=lang,
        message_type=result["type"],
        sources=result["sources"],
    )

    db.add(assistant_message)
    if result["type"] == "answer" and monitor.ready(db):
        db.flush()
        db.connection().exec_driver_sql("UPDATE chat_messages SET question_message_id=%s WHERE id=%s",
                                        (question_message.id,assistant_message.id))
    if charge is not None:
        charge.record_success(db)
    if result["type"] == "answer":
        analytics.record(db, user.id, "chat")
    db.commit()
    db.refresh(assistant_message)

    return {
        "session_id": session.id,
        **serialize_message(assistant_message),
    }


@router.post("/messages/{message_id}/feedback")
def save_feedback(
    message_id: int,
    payload: FeedbackRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    message = db.get(ChatMessage, message_id)

    if not message or message.role != "assistant":
        raise HTTPException(
            status_code=404,
            detail="AI message not found.",
        )

    get_own_session(
        db, user.id, message.session_id
    )

    if message.message_type != "answer":
        raise HTTPException(
            status_code=400,
            detail="Feedback is available for AI answers only.",
        )

    feedback = db.scalar(
        select(ChatFeedback).where(
            ChatFeedback.message_id == message_id
        )
    )

    if feedback:
        feedback.helpful = payload.helpful
    else:
        feedback = ChatFeedback(message_id=message_id, user_id=user.id, helpful=payload.helpful)
        db.add(feedback)

    if monitor.ready(db):
        db.flush()
        review = monitor.table(db,"ai_feedback_reviews")
        shared = payload.share_content and not payload.helpful
        stmt = insert(review).values(feedback_id=feedback.id,share_content=shared)
        db.execute(stmt.on_duplicate_key_update(share_content=shared))
    elif payload.share_content:
        raise HTTPException(503,"Sharing feedback is awaiting the monitoring update.")

    db.commit()

    return {"message": "Feedback saved."}
