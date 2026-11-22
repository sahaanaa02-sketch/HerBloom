
import unicodedata
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.article import Article
from app.models.chat import ArticleChunk


EN_STOP = {
    "what", "when", "where", "which", "why", "how",
    "can", "could", "should", "would", "the", "and",
    "for", "with", "from", "after", "about", "please",
    "tell", "help", "does", "have", "that", "this",
    "are", "you", "your", "my", "me", "is", "it",
}

TA_STOP = {
    "என்ன", "எப்படி", "எப்போது", "எனக்கு", "நான்",
    "பற்றி", "சொல்லுங்கள்", "வேண்டும்", "உள்ளது",
}


def split_chunks(content: str, size: int = 200):
    words = content.split()
    return [
        " ".join(words[i:i + size])
        for i in range(0, len(words), size)
    ]


def reviewed(article: Article) -> bool:
    return bool(
        article.publicly_visible
        and article.reviewed_by
        and article.reviewed_by.strip()
        and article.review_date
    )


def rebuild_chunks(db: Session):
    db.query(ArticleChunk).delete(synchronize_session=False)

    articles = db.scalars(
        select(Article).where(
            Article.publicly_visible,
            Article.reviewed_by.is_not(None),
            Article.review_date.is_not(None),
        )
    ).all()

    count = 0

    for article in articles:
        if not reviewed(article):
            continue

        for lang in ("en", "ta"):
            body = (
                article.body_ta if lang == "ta"
                else article.body_en
            )

            if not body or not body.strip():
                continue

            for index, chunk in enumerate(split_chunks(body)):
                db.add(
                    ArticleChunk(
                        article_id=article.id,
                        language=lang,
                        chunk_index=index,
                        content=chunk,
                    )
                )
                count += 1

    db.commit()
    return count


def keywords(question: str, lang: str):
    normalized = unicodedata.normalize("NFC", question.casefold())
    words = "".join(
        character if character.isalnum() or unicodedata.category(character).startswith("M") else " "
        for character in normalized
    ).split()

    stop = TA_STOP if lang == "ta" else EN_STOP

    return list(dict.fromkeys(
        word for word in words
        if len(word) >= 3 and word not in stop
    ))[:12]


def search_articles(
    db: Session,
    question: str,
    lang: str,
    article_id: int | None = None,
):
    terms = keywords(question, lang)

    if not terms:
        return []

    query = (
        select(ArticleChunk, Article)
        .join(Article, ArticleChunk.article_id == Article.id)
        .where(
            ArticleChunk.language == lang,
            Article.publicly_visible,
            Article.reviewed_by.is_not(None),
            Article.review_date.is_not(None),
        )
    )

    if article_id is not None:
        query = query.where(Article.id == article_id)

    candidates = []

    if lang == "en":
        # Use a few meaningful terms rather than requiring
        # every word in the question to match.
        expression = " ".join(
            f"{term}*" for term in terms
            if term.isascii() and term.isalnum()
        )

        if expression:
            rows = db.execute(
                text("""
                    SELECT id
                    FROM article_chunks
                    WHERE language = :lang
                      AND MATCH(content)
                          AGAINST (:q IN BOOLEAN MODE)
                    LIMIT 40
                """),
                {"lang": lang, "q": expression},
            ).all()

            ids = [row.id for row in rows]

            if ids:
                candidates = db.execute(
                    query.where(ArticleChunk.id.in_(ids))
                ).all()

    else:
        # Conservative Tamil fallback.
        # Better Tamil tokenization should be tested
        # before production release.
        candidates = db.execute(query).all()

    ranked = []

    for chunk, article in candidates:
        if not reviewed(article):
            continue

        title = (
            article.title_ta if lang == "ta"
            else article.title_en
        )

        searchable = unicodedata.normalize("NFC", f"{title} {chunk.content}".casefold())

        matches = sum(
            1 for term in terms if term in searchable
        )

        if matches < 1:
            continue

        score = matches / len(terms)

        # Require some meaningful overlap.
        if score < 0.25:
            continue

        ranked.append((score, chunk, article, title))

    ranked.sort(key=lambda item: item[0], reverse=True)

    output = []
    seen_articles = set()

    for score, chunk, article, title in ranked:
        if article.id in seen_articles:
            continue

        seen_articles.add(article.id)

        output.append({
            "article_id": article.id,
            "title": title,
            "content": chunk.content,
        })

        if len(output) >= 4:
            break

    return output
