import logging
import unicodedata

from sqlalchemy import func, inspect, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.exc import SQLAlchemyError

from app.models.nutrition import Food, FoodAlias, UnmatchedFoodName

logger = logging.getLogger(__name__)


def food_key(name):
    return " ".join(unicodedata.normalize("NFKC", name).casefold().split())


def safe_scan_name(name):
    return (1 <= len(name) <= 150 and len(name.split()) <= 12
            and any(c.isalpha() for c in name)
            and all(c.isalpha() or unicodedata.category(c).startswith("M") or c in " -'" for c in name))


def match_scanned_foods(db, result, *, commit=True):
    names = {food_key(item["name"]) for item in result["items"]}
    if not names:
        return result
    catalog = {}
    for id, name_en, name_ta in db.execute(select(Food.id, Food.name_en, Food.name_ta)):
        for name in (name_en, name_ta):
            if name and food_key(name) in names:
                catalog.setdefault(food_key(name), {})[id] = name_en
    for id, name_en, alias in db.execute(select(Food.id, Food.name_en, FoodAlias.alias).join(FoodAlias)):
        if food_key(alias) in names:
            catalog.setdefault(food_key(alias), {})[id] = name_en

    unmatched = set()
    for item in result["items"]:
        key = food_key(item["name"])
        candidates = catalog.get(key, {})
        if len(candidates) == 1:
            item["name"] = next(iter(candidates.values()))
        elif safe_scan_name(key):
            unmatched.add(key)

    try:
        if unmatched and inspect(db.connection()).has_table("unmatched_food_names"):
            with db.begin_nested():
                for name in sorted(unmatched):
                    stmt = insert(UnmatchedFoodName).values(name=name, count=1, last_seen=func.now(), resolved=False)
                    db.execute(stmt.on_duplicate_key_update(count=UnmatchedFoodName.count + 1,
                                                            last_seen=func.now(), resolved=False))
            if commit:
                db.commit()
    except SQLAlchemyError:
        if commit:
            db.rollback()
        logger.warning("Could not record aggregate scanner terms.")
    return result
