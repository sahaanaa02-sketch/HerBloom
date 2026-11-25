"""Aggregates for observed mother engagement. Never return account-level rows."""
import csv
from datetime import timedelta
from io import StringIO

from sqlalchemy import inspect, text

from app.services.recovery_rules import local_today

MIN_GROUP = 5
FEATURES = {"checkin": "Check-ins", "scan": "Meal scans", "chat": "AI messages",
            "exercise": "Exercise sessions", "article": "Article opens"}
STREAM = """
    SELECT user_id,activity_day,feature,resource_id,hits FROM mother_engagement
    WHERE activity_day >= :start AND activity_day < :stop
    UNION ALL
    SELECT user_id,submitted_on,'checkin',0,1 FROM wellbeing_checkins
    WHERE submitted_on >= :start AND submitted_on < :stop
    UNION ALL
    SELECT user_id,DATE(completed_at),'exercise',exercise_id,1 FROM exercise_sessions
    WHERE completed_at >= :start AND completed_at < :stop
"""


def ready(db):
    return inspect(db.connection()).has_table("faqs")


def record(db, user_id, feature, resource_id=0):
    if ready(db):
        db.connection().exec_driver_sql(
            "INSERT INTO mother_engagement(user_id,activity_day,feature,resource_id) VALUES (%s,%s,%s,%s) "
            "ON DUPLICATE KEY UPDATE hits=hits+1", (user_id, local_today(), feature, resource_id),
        )


def protected(value, people):
    return int(value) if people >= MIN_GROUP else None


def monday(day):
    return day - timedelta(days=day.weekday())


def report(db, start, end):
    values = {"start": start, "stop": end + timedelta(days=1), "minimum": MIN_GROUP}

    def query(statement, stream=False):
        cte = ("WITH activity AS (" + STREAM + "), mothers AS ("
               "SELECT a.* FROM activity a JOIN users u ON u.id=a.user_id "
               "WHERE u.role='MOTHER' AND u.anonymized_at IS NULL) ") if stream else ""
        return db.execute(text(cte + statement), values).all()

    days = query("SELECT activity_day, COUNT(DISTINCT user_id) FROM mothers GROUP BY activity_day", True)
    weeks = query("SELECT DATE_SUB(activity_day, INTERVAL WEEKDAY(activity_day) DAY),COUNT(DISTINCT user_id) "
                  "FROM mothers GROUP BY 1", True)
    feature_rows = {key: protected(total, people) for key, total, people in query(
        "SELECT feature,SUM(hits),COUNT(DISTINCT user_id) FROM mothers GROUP BY feature", True)}

    def series(rows, first, stride):
        totals = dict(rows)
        return [{"date": day.isoformat(), "count": protected(totals.get(day, 0), totals.get(day, 0))}
                for offset in range(0, (end - first).days + 1, stride)
                for day in [first + timedelta(days=offset)]]

    def ranked(feature, table, title, visibility):
        rows = query(f"SELECT content.{title}, SUM(m.hits),COUNT(DISTINCT m.user_id) "
                     f"FROM mothers m JOIN {table} content ON content.id=m.resource_id "
                     f"WHERE m.feature='{feature}' AND ({visibility}) GROUP BY content.id,content.{title} "
                     "HAVING COUNT(DISTINCT m.user_id)>=:minimum ORDER BY SUM(m.hits) DESC,content.id LIMIT 10", True)
        return [{"title": name, "count": int(count)} for name, count, _ in rows]

    cohorts = query("""
        SELECT DATE_SUB(DATE(created_at), INTERVAL WEEKDAY(created_at) DAY),COUNT(*)
        FROM users WHERE role='MOTHER' AND anonymized_at IS NULL AND created_at>=:start AND created_at<:stop
        GROUP BY 1 HAVING COUNT(*)>=:minimum ORDER BY 1
    """)
    retained = query("""
        SELECT DATE_SUB(DATE(u.created_at), INTERVAL WEEKDAY(u.created_at) DAY),
               TIMESTAMPDIFF(WEEK, DATE_SUB(DATE(u.created_at), INTERVAL WEEKDAY(u.created_at) DAY),
                DATE_SUB(m.activity_day, INTERVAL WEEKDAY(m.activity_day) DAY)),
               COUNT(DISTINCT m.user_id)
        FROM mothers m JOIN users u ON u.id=m.user_id
        WHERE u.created_at>=:start AND u.created_at<:stop AND m.activity_day>=DATE(u.created_at)
        GROUP BY 1,2
    """, True)
    retained = {(day, week): n for day, week, n in retained}
    retention = []
    for day, size in cohorts:
        for week in range((end - day).days // 7 + 1):
            hits = retained.get((day, week), 0)
            value = hits if hits >= MIN_GROUP and size - hits >= MIN_GROUP else None
            retention.append({"cohort": day.isoformat(), "week": week, "size": size, "active": value})

    flow = None
    schema = inspect(db.connection())
    if schema.has_table("billing_payment_events") and schema.has_table("entitlement_periods"):
        snapshot = query("""
            SELECT COUNT(*),
                   COALESCE(SUM(EXISTS (SELECT 1 FROM entitlement_periods t
                       WHERE t.user_id=u.id AND t.plan_code='trial'
                         AND t.starts_at_utc<DATE_SUB(:stop, INTERVAL 330 MINUTE))),0),
                   COALESCE(SUM(EXISTS (SELECT 1 FROM entitlement_periods t
                       JOIN billing_orders b ON b.user_id=t.user_id
                       WHERE t.user_id=u.id AND t.plan_code='trial'
                         AND b.verified_at_utc>=t.starts_at_utc
                         AND b.verified_at_utc<DATE_SUB(:stop, INTERVAL 330 MINUTE))),0)
            FROM users u WHERE u.role='MOTHER' AND u.anonymized_at IS NULL
              AND u.created_at>=:start AND u.created_at<:stop
        """)[0]
        free, trial, paid = map(int, snapshot)
        used = [protected(free, free), None, None]
        if trial >= MIN_GROUP and free - trial >= MIN_GROUP:
            used[1] = trial
            if paid >= MIN_GROUP and trial - paid >= MIN_GROUP:
                used[2] = paid
        flow = dict(zip(("signup", "trial", "paid_after_trial"), used))
        cancelled, owners = query("""
            SELECT COUNT(DISTINCT b.id),COUNT(DISTINCT b.user_id)
            FROM billing_orders b JOIN billing_payment_events e ON e.order_id=b.id
            JOIN users u ON u.id=b.user_id
            WHERE u.role='MOTHER' AND u.anonymized_at IS NULL AND e.source='notify'
            AND e.provider_status='cancelled'
            AND e.received_at_utc>=DATE_SUB(:start, INTERVAL 330 MINUTE)
            AND e.received_at_utc<DATE_SUB(:stop, INTERVAL 330 MINUTE)
        """)[0]
        checkout_cancellations = protected(cancelled, owners)
    else:
        checkout_cancellations = None

    return {"start": start.isoformat(), "end": end.isoformat(), "minimum_group": MIN_GROUP,
            "daily": series(days, start, 1), "weekly": series(weeks, monday(start), 7),
            "features": {name: feature_rows.get(key) for key, name in FEATURES.items()},
            "retention": retention,
            "articles": ranked("article", "articles", "title_en",
                               "content.published AND (content.editorial_status IS NULL OR content.editorial_status='published')"),
            "exercises": ranked("exercise", "recovery_exercises", "name",
                                "content.editorial_status IS NULL OR content.editorial_status='published'"),
            "conversion": flow, "checkout_cancellations": checkout_cancellations,
            "subscription_cancellations": None}


def csv_report(data):
    stream = StringIO()
    writer = csv.writer(stream)
    writer.writerow(("metric", "period_or_label", "count", "group_size"))

    def add(metric, label, count, size=None):
        if label.lstrip().startswith(("=", "+", "-", "@")) or label.startswith(("\t","\r","\n")):
            label = "'" + label
        writer.writerow((metric, label, count, size))

    for bucket in ("daily", "weekly", "articles", "exercises"):
        for row in data[bucket]:
            add(bucket, row.get("date", row.get("title")), row["count"])
    for label, count in data["features"].items():
        add("features", label, count)
    for row in data["retention"]:
        add("retention", f'{row["cohort"]} week {row["week"]}', row["active"], row["size"])
    for label, count in (data["conversion"] or {}).items():
        add("conversion", label, count)
    add("checkout_cancellations", "range", data["checkout_cancellations"])
    add("subscription_cancellations", "range", data["subscription_cancellations"])
    return stream.getvalue()
