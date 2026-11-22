"""Synthetic bilingual retrieval fixtures."""
from datetime import date
from types import SimpleNamespace
from unittest.mock import Mock

from app.services.article_search import keywords, search_articles


def test_tamil_words_keep_combining_marks_and_find_reviewed_fixture():
    word = "\u0ba4\u0ba3\u0bcd\u0ba3\u0bc0\u0bb0\u0bcd"
    assert keywords(word, "ta") == [word]
    approved = SimpleNamespace(id=1, title_ta="Synthetic", publicly_visible=True,
                               reviewed_by="Test reviewer", review_date=date(2026, 11, 20))
    hidden = SimpleNamespace(id=2, title_ta="Synthetic draft", publicly_visible=False,
                             reviewed_by="Test reviewer", review_date=date(2026, 11, 20))
    chunk = SimpleNamespace(content=word)
    db = Mock()
    db.execute.return_value.all.return_value = [(chunk, approved), (chunk, hidden)]
    assert search_articles(db, word, "ta") == [
        {"article_id": 1, "title": "Synthetic", "content": word},
    ]


def test_english_tokens_keep_the_existing_stop_word_filter():
    assert keywords("What about WATER?", "en") == ["water"]
