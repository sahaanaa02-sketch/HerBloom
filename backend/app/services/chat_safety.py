
import re

from app.services.safety_content import published_rows, safety_message

URGENT_PATTERNS = [
    r"\bheavy bleeding\b",
    r"\bsoaking (a |one |two )?pad",
    r"\bchest pain\b",
    r"\bdifficulty breathing\b",
    r"\bcan't breathe\b",
    r"\bcannot breathe\b",
    r"\bfainting\b",
    r"\bseizure\b",
    r"\bsevere headache\b",
    r"\bblurred vision\b",
    r"\bhigh fever\b",
    r"\bsevere abdominal pain\b",
    r"அதிக இரத்தப்போக்கு",
    r"மூச்சு விட முடிய",
    r"நெஞ்சு வலி",
    r"மயக்கம்",
    r"வலிப்பு",
    r"கடுமையான தலைவலி",
    r"கண் மங்க",
]

CRISIS_PATTERNS = [
    r"\bkill myself\b",
    r"\bsuicid(?:e|al)\b",
    r"\bself[- ]harm\b",
    r"\bhurt myself\b",
    r"\bend my life\b",
    r"தற்கொலை",
    r"உயிரை மாய்த்த",
    r"என்னை காயப்படுத்த",
]

CARDS = {
    "urgent": {
        "en": (
            "These symptoms may need urgent medical attention. "
            "Call Sri Lanka's 1990 ambulance service or go to "
            "the nearest emergency department now. "
            "Do not wait for a chatbot response."
        ),
        "ta": (
            "இந்த அறிகுறிகளுக்கு அவசர மருத்துவ உதவி தேவைப்படலாம். "
            "இலங்கையின் 1990 அவசர ஆம்புலன்ஸ் சேவையை அழைக்கவும் "
            "அல்லது அருகிலுள்ள அவசர சிகிச்சைப் பிரிவுக்குச் செல்லவும். "
            "Chatbot பதிலுக்காகக் காத்திருக்க வேண்டாம்."
        ),
    },
    "crisis": {
        "en": (
            "Support is available. If you are in immediate danger, "
            "call 1990 or go to the nearest emergency department. "
            "You can also contact Sri Lanka's 1926 mental health "
            "helpline. Please tell a trusted person or healthcare "
            "professional what you are experiencing."
        ),
        "ta": (
            "உதவி கிடைக்கும். உடனடி ஆபத்து இருந்தால் 1990-ஐ "
            "அழைக்கவும் அல்லது அருகிலுள்ள அவசர சிகிச்சைப் "
            "பிரிவுக்குச் செல்லவும். மனநல உதவிக்கு இலங்கையின் "
            "1926 சேவையையும் தொடர்புகொள்ளலாம். "
            "நம்பிக்கையான ஒருவரிடமோ மருத்துவ நிபுணரிடமோ பேசுங்கள்."
        ),
    },
}


def match_term(text, lang, db=None):
    normalized = text.casefold()
    for category, patterns in (("crisis", CRISIS_PATTERNS), ("urgent", URGENT_PATTERNS)):
        for pattern in patterns:
            match = re.search(pattern, normalized, re.IGNORECASE)
            if match:
                return category, match.group()
    if db is not None:
        terms = published_rows(db, "red_flag_terms")
        for category in ("crisis", "urgent"):
            for row in terms:
                if row["category"] == category and row["lang"] == lang:
                    if re.search(r"(?<!\w)" + re.escape(row["term"].casefold()) + r"(?!\w)", normalized):
                        return category, row["term"]
    return None


def check_text(text: str, lang: str = "en", db=None, include_match=False):
    match = match_term(text, lang, db)
    if match is None:
        return None
    category, term = match
    body = CARDS[category][lang]
    if db is not None:
        body = safety_message(db, category + "_card", lang, body)
    response = {"type": category, "text": body, "sources": []}
    if include_match:
        response["matched_term"] = term
    return response
