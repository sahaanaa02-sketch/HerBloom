
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.recovery import (
    SleepLog,
    WalkLog,
    ExerciseSession,
    BodyCheck,
)
from app.models.nutrition import (
    FoodLog,
    Food,
    MealPlan,
    MealPlanItem,
    NutritionTarget,
)
from app.models.hydration import HydrationLog
from app.models.wellbeing import (
    WellbeingCheckin,
    JournalEntry,
)
from app.models.todo import DashboardTodo
from app.models.reminder import DashboardReminder
from app.models.mother_profile import MotherProfile


# Set to True only after confirming that foods.protein
# and foods.iron contain nutrient values per 100 grams.
NUTRIENTS_PER_100G_CONFIRMED = False


def calculate_weekly_report(
    db: Session,
    user_id: int,
    week_start: date,
) -> dict:
    """
    Calculate weekly tracking statistics for one mother.

    - Monday to Sunday reporting
    - All queries scoped to user_id
    - Missing observations represented as None
    - No AI calculations or medical diagnosis
    """

    if week_start.weekday() != 0:
        raise ValueError("week_start must be a Monday")

    week_end = week_start + timedelta(days=6)
    end_exclusive = week_start + timedelta(days=7)

    start_datetime = datetime.combine(
        week_start, time.min
    )
    end_datetime = datetime.combine(
        end_exclusive, time.min
    )

    days = [
        week_start + timedelta(days=i)
        for i in range(7)
    ]

    recorded_days = set()

    # ==========================================
    # DATABASE HELPERS
    # ==========================================

    def date_query(model, column):
        return db.scalars(
            select(model).where(
                model.user_id == user_id,
                column >= week_start,
                column < end_exclusive,
            )
        ).all()

    def datetime_query(model, column):
        return db.scalars(
            select(model).where(
                model.user_id == user_id,
                column >= start_datetime,
                column < end_datetime,
            )
        ).all()

    def average(values, decimals=1):
        if not values:
            return None
        return round(sum(values) / len(values), decimals)

    def daily_series(values, key):
        return [
            {
                "date": day.isoformat(),
                key: values.get(day),
            }
            for day in days
        ]

    # ==========================================
    # 1. SLEEP
    # ==========================================

    sleep_logs = date_query(SleepLog, SleepLog.date)

    sleep_by_day = defaultdict(list)

    for log in sleep_logs:
        recorded_days.add(log.date)

        if log.hours is not None and log.hours >= 0:
            sleep_by_day[log.date].append(
                float(log.hours)
            )

    sleep_daily_values = {
        day: round(sum(values), 1)
        for day, values in sleep_by_day.items()
        if values
    }

    sleep = {
        "average_hours": average(
            list(sleep_daily_values.values())
        ),
        "nights_logged": len(sleep_daily_values),
        "daily": daily_series(
            sleep_daily_values, "hours"
        ),
    }

    # ==========================================
    # 2. WALKING
    # ==========================================

    walk_logs = date_query(WalkLog, WalkLog.date)

    walk_by_day = defaultdict(int)

    for log in walk_logs:
        recorded_days.add(log.date)

        walk_by_day[log.date] += max(
            log.minutes or 0, 0
        )

    walking = {
        "days_walked": sum(
            1 for minutes in walk_by_day.values()
            if minutes > 0
        ),
        "total_minutes": (
            sum(walk_by_day.values())
            if walk_logs else None
        ),
        "daily": daily_series(
            walk_by_day, "minutes"
        ),
    }

    # ==========================================
    # 3. EXERCISE
    # ==========================================

    exercise_sessions = datetime_query(
        ExerciseSession,
        ExerciseSession.completed_at,
    )

    exercise_by_day = defaultdict(int)
    exercise_discomfort = 0

    for session in exercise_sessions:
        day = session.completed_at.date()

        recorded_days.add(day)
        exercise_by_day[day] += 1

        if (
            session.pain
            or session.bleeding
            or session.pelvic_heaviness
        ):
            exercise_discomfort += 1

    exercise = {
        "sessions": len(exercise_sessions),
        "discomfort_reports": exercise_discomfort,
        "daily": [
            {
                "date": day.isoformat(),
                "sessions": exercise_by_day.get(day, 0),
            }
            for day in days
        ],
    }

    # ==========================================
    # 4. PHYSICAL RECOVERY
    # ==========================================

    body_checks = date_query(
        BodyCheck, BodyCheck.date
    )

    discomfort_dates = set()

    for check in body_checks:
        recorded_days.add(check.date)

        if (
            check.back_pain
            or check.pelvic_heaviness
            or check.breast_pain
        ):
            discomfort_dates.add(check.date)

    recovery = {
        "body_checks_logged": len(body_checks),
        "discomfort_days": len(discomfort_dates),
    }

    # ==========================================
    # 5. MOOD AND WELLBEING
    # ==========================================

    checkins = date_query(
        WellbeingCheckin,
        WellbeingCheckin.submitted_on,
    )

    journals = datetime_query(
        JournalEntry,
        JournalEntry.created_at,
    )

    mood_by_day = defaultdict(list)

    for checkin in checkins:
        recorded_days.add(checkin.submitted_on)

    for journal in journals:
        day = journal.created_at.date()
        recorded_days.add(day)

        if journal.mood_tag:
            mood_by_day[day].append(
                journal.mood_tag
            )

    # mood_tag is text, not a validated numeric scale.
    # Do not manufacture numeric mood scores.

    wellbeing = {
        "checkins": len(checkins),
        "journal_entries": len(journals),
        "mood_tags": [
            {
                "date": day.isoformat(),
                "tags": mood_by_day.get(day, []),
            }
            for day in days
        ],
        "average_mood": None,
        "trend": None,
        "daily_scores": None,
    }

    # ==========================================
    # 6. FOOD AND NUTRITION
    # ==========================================

    food_logs = date_query(
        FoodLog, FoodLog.date
    )

    meal_slots = set()

    for log in food_logs:
        recorded_days.add(log.date)

        if log.meal_type:
            meal_slots.add(
                (log.date, log.meal_type)
            )

    food_ids = {
        log.food_id for log in food_logs
    }

    foods = {}

    if food_ids:
        foods = {
            food.id: food
            for food in db.scalars(
                select(Food).where(
                    Food.id.in_(food_ids)
                )
            ).all()
        }

    daily_nutrients = defaultdict(
        lambda: {
            "protein": 0.0,
            "iron": 0.0,
        }
    )

    verified_days = set()
    verified_food_entries = 0

    for log in food_logs:
        food = foods.get(log.food_id)

        if not food or not food.verified:
            continue

        verified_food_entries += 1

        if not NUTRIENTS_PER_100G_CONFIRMED:
            continue

        if log.grams is None or log.grams < 0:
            continue

        factor = log.grams / 100.0

        daily_nutrients[log.date]["protein"] += (
            (food.protein or 0) * factor
        )

        daily_nutrients[log.date]["iron"] += (
            (food.iron or 0) * factor
        )

        verified_days.add(log.date)

    # ==========================================
    # 7. MEAL PLAN
    # ==========================================

    plan_ids = db.scalars(
        select(MealPlan.id).where(
            MealPlan.user_id == user_id
        )
    ).all()

    planned_items = []

    if plan_ids:
        planned_items = db.scalars(
            select(MealPlanItem).where(
                MealPlanItem.plan_id.in_(plan_ids),
                MealPlanItem.date >= week_start,
                MealPlanItem.date < end_exclusive,
            )
        ).all()

    # ==========================================
    # 8. NUTRITION TARGET
    # ==========================================

    profile = db.scalar(
        select(MotherProfile).where(
            MotherProfile.user_id == user_id
        )
    )

    target = None

    if profile and profile.feeding_method:
        target = db.scalar(
            select(NutritionTarget).where(
                NutritionTarget.feeding_method
                == profile.feeding_method,
                NutritionTarget.reviewed.is_(True),
            )
        )

    nutrition_daily = []

    for day in days:
        day_meals = sum(
            1
            for meal_date, _ in meal_slots
            if meal_date == day
        )

        has_verified_nutrients = (
            day in verified_days
        )

        nutrition_daily.append({
            "date": day.isoformat(),
            "meals": (
                day_meals
                if day in {
                    log.date for log in food_logs
                }
                else None
            ),
            "protein": (
                round(
                    daily_nutrients[day]["protein"], 2
                )
                if has_verified_nutrients
                else None
            ),
            "iron": (
                round(
                    daily_nutrients[day]["iron"], 2
                )
                if has_verified_nutrients
                else None
            ),
        })

    nutrition = {
        "meals_logged": (
            len(meal_slots)
            if food_logs else None
        ),
        "planned_meals": (
            len(planned_items)
            if planned_items else None
        ),
        "planned_meals_eaten": (
            sum(
                1 for item in planned_items
                if item.eaten
            )
            if planned_items else None
        ),
        "verified_food_entries":
            verified_food_entries,
        "protein_target": (
            target.protein if target else None
        ),
        "iron_target": (
            target.iron if target else None
        ),
        "daily": nutrition_daily,
    }

    # ==========================================
    # 9. HYDRATION
    # ==========================================

    hydration_logs = date_query(
        HydrationLog, HydrationLog.date
    )

    hydration_by_day = {}

    for log in hydration_logs:
        recorded_days.add(log.date)

        hydration_by_day[log.date] = max(
            log.glasses or 0, 0
        )

    hydration = {
        "average_glasses": average(
            list(hydration_by_day.values())
        ),
        "days_logged": len(hydration_by_day),
        "daily": daily_series(
            hydration_by_day, "glasses"
        ),
    }

    # ==========================================
    # 10. COMPLETED VS MISSED
    # ==========================================

    todos = date_query(
        DashboardTodo, DashboardTodo.date
    )

    reminders = datetime_query(
        DashboardReminder,
        DashboardReminder.remind_at,
    )

    today = date.today()

    completed = 0
    missed = 0
    pending = 0

    for todo in todos:
        if todo.done:
            completed += 1
        elif todo.date < today:
            missed += 1
        else:
            pending += 1

    for reminder in reminders:
        if reminder.completed:
            completed += 1
        elif reminder.remind_at.date() < today:
            missed += 1
        else:
            pending += 1

    tasks = {
        "completed": completed,
        "missed": missed,
        "pending": pending,
        "total": len(todos) + len(reminders),
    }

    # ==========================================
    # 11. DATA COMPLETENESS
    # ==========================================

    days_with_data = len(recorded_days)

    completeness = {
        "days_with_data": days_with_data,
        "days_in_week": 7,
        "percentage": round(
            days_with_data / 7 * 100
        ),
    }

    # ==========================================
    # 12. FINAL WEEKLY REPORT
    # ==========================================

    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "sleep": sleep,
        "walking": walking,
        "exercise": exercise,
        "recovery": recovery,
        "wellbeing": wellbeing,
        "nutrition": nutrition,
        "hydration": hydration,
        "tasks": tasks,
        "completeness": completeness,
    }
