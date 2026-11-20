
from sqlalchemy import text

from app.database import Base, engine, SessionLocal
from app.models.user import User
from app.models.article import Article
from app.models.chat import (
    ChatSession,
    ChatMessage,
    ChatFeedback,
    SafetyEvent,
    ArticleChunk,
)
from app.services.article_search import rebuild_chunks


def main():
    Base.metadata.create_all(bind=engine)

    with engine.begin() as connection:
        index_exists = connection.execute(
            text("""
                SELECT COUNT(*)
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                  AND table_name = 'article_chunks'
                  AND index_name = 'ft_article_chunks_content'
            """)
        ).scalar()

        if not index_exists:
            connection.execute(
                text("""
                    ALTER TABLE article_chunks
                    ADD FULLTEXT INDEX
                    ft_article_chunks_content (content)
                """)
            )

    db = SessionLocal()
    try:
        count = rebuild_chunks(db)
        print(f"Chat tables ready. {count} article chunks indexed.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
