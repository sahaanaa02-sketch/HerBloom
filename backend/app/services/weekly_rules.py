
from datetime import date, timedelta
from typing import Any


def make_flag(
    code: str,
    title: str,
    message: str,
    action_label: str,
    action_page: str,
    severity: str = "attention",
) -> dict[str, Any]:
    return {
        "code": code,
        "title": title,
        "message": message,
        "severity": severity,
        "action_label": action_label,
        "action_page": action_page,
    }


def evaluate_weekly_rules(
    report: dict,
    profile=None,
    thresholds: dict | None = None,
) -> list[dict]:
    """
    Evaluate weekly report data using explicit rules.

    Medical threshold-based flags are disabled
    until reviewed thresholds are provided.

    No AI is involved in these calculations.
    """

    flags = []

    thresholds = thresholds or {}

    # ==========================================
    # 1. DATA COMPLETENESS
    # ==========================================

    completeness = report.get("completeness") or {}

    days_with_data = completeness.get("days_with_data", 0)

    if days_with_data == 0:
        flags.append(
            make_flag(
                code="no_tracking_data",
                title="No tracking entries this week",
                message=(
                    "There are no tracking entries for this week. "
                    "You can start whenever you're ready."
                ),
                action_label="Go to Dashboard",
                action_page="dashboard",
                severity="info",
            )
        )

    elif days_with_data < 4:
        flags.append(
            make_flag(
                code="limited_tracking_data",
                title="A few days were recorded",
                message=(
                    f"You recorded information on "
                    f"{days_with_data} of 7 days. "
                    "Your summary may not reflect your whole week."
                ),
                action_label="View Dashboard",
                action_page="dashboard",
                severity="info",
            )
        )

    # ==========================================
    # 2. LOW MOOD
    # ==========================================

    mood_threshold = thresholds.get("low_mood")

    wellbeing = report.get("wellbeing") or {}

    mood_values = wellbeing.get("daily_scores")

    if (
        mood_threshold is not None
        and isinstance(mood_values, list)
    ):
        valid_scores = [
            item.get("score")
            for item in mood_values
            if isinstance(item, dict)
            and isinstance(item.get("score"), (int, float))
        ]

        if len(valid_scores) >= 4:
            low_days = sum(
                score <= mood_threshold
                for score in valid_scores
            )

            if low_days >= 4:
                flags.append(
                    make_flag(
                        code="low_mood",
                        title="Your mood may need extra support",
                        message=(
                            "Several recorded mood check-ins "
                            "were low this week. Consider "
                            "talking with your healthcare provider."
                        ),
                        action_label="Mental Wellbeing",
                        action_page="wellbeing",
                    )
                )

    # ==========================================
    # 3. REPEATED DISCOMFORT
    # ==========================================

    discomfort_threshold = thresholds.get(
        "repeated_discomfort_days"
    )

    recovery = report.get("recovery") or {}

    discomfort_days = recovery.get("discomfort_days")

    if (
        discomfort_threshold is not None
        and isinstance(discomfort_days, int)
        and discomfort_days >= discomfort_threshold
    ):
        flags.append(
            make_flag(
                code="repeated_discomfort",
                title="Repeated discomfort recorded",
                message=(
                    "You recorded discomfort on multiple "
                    "days. Review your symptoms with your "
                    "doctor or midwife."
                ),
                action_label="My Recovery",
                action_page="recovery",
            )
        )

    # ==========================================
    # 4. LOW IRON INTAKE
    # ==========================================

    iron_ratio_threshold = thresholds.get(
        "low_iron_ratio"
    )

    nutrition = report.get("nutrition") or {}

    daily_nutrition = nutrition.get("daily") or []

    iron_target = nutrition.get("iron_target")

    if (
        iron_ratio_threshold is not None
        and isinstance(iron_target, (int, float))
        and iron_target > 0
    ):
        valid_iron_days = [
            item["iron"]
            for item in daily_nutrition
            if isinstance(item, dict)
            and isinstance(item.get("iron"), (int, float))
        ]

        # Do not flag from incomplete food tracking.
        if len(valid_iron_days) >= 5:
            average_iron = (
                sum(valid_iron_days) / len(valid_iron_days)
            )

            if (
                average_iron / iron_target
                < iron_ratio_threshold
            ):
                flags.append(
                    make_flag(
                        code="low_iron",
                        title="Iron intake may need attention",
                        message=(
                            "Your recorded iron intake was "
                            "below the configured reference. "
                            "Discuss nutrition needs with a "
                            "qualified healthcare professional."
                        ),
                        action_label="Nutrition",
                        action_page="nutrition",
                    )
                )

    # ==========================================
    # 5. GDM FOLLOW-UP
    # ==========================================

    gdm_enabled = thresholds.get(
        "gdm_test_followup_enabled", False
    )

    if gdm_enabled and profile is not None:
        history = getattr(
            profile, "gdm_history", False
        )

        status = str(
            getattr(profile, "gdm_test_status", "") or ""
        ).lower()

        birth_date = getattr(
            profile, "baby_birth_date", None
        )

        due_weeks = thresholds.get(
            "gdm_followup_weeks"
        )

        if (
            history is True
            and isinstance(birth_date, date)
            and isinstance(due_weeks, int)
            and due_weeks > 0
            and status in {
                "pending",
                "not_done",
                "not completed",
            }
        ):
            due_date = birth_date + timedelta(
                weeks=due_weeks
            )

            report_end = date.fromisoformat(
                report["week_end"]
            )

            if report_end >= due_date:
                flags.append(
                    make_flag(
                        code="gdm_test_due",
                        title="Glucose follow-up reminder",
                        message=(
                            "Your recorded follow-up status "
                            "suggests a glucose test may be due. "
                            "Confirm the timing with your "
                            "healthcare provider."
                        ),
                        action_label="Profile and Settings",
                        action_page="settings",
                    )
                )

    return flags
