from datetime import UTC, datetime, timedelta
from unittest import TestCase
from zoneinfo import ZoneInfo

from app.services.free_quota import FREE_LIMITS, free_quota_window


class FreeQuotaWindowTest(TestCase):
    anchor = datetime(2026, 1, 31, 23, 45, tzinfo=UTC)

    def test_limits(self):
        self.assertEqual(dict(FREE_LIMITS), {"scan": 3, "chat": 10})

    def test_first_window_includes_activation_and_excludes_reset(self):
        reset = self.anchor + timedelta(days=30)
        self.assertEqual(free_quota_window(self.anchor, self.anchor).ends_at, reset)
        self.assertEqual(free_quota_window(self.anchor, reset - timedelta(microseconds=1)).starts_at, self.anchor)
        self.assertEqual(free_quota_window(self.anchor, reset).starts_at, reset)
        self.assertEqual(free_quota_window(self.anchor, reset).ends_at, reset + timedelta(days=30))

    def test_return_after_paid_or_trial_time_keeps_original_anchor(self):
        window = free_quota_window(self.anchor, self.anchor + timedelta(days=97))
        self.assertEqual(window.starts_at, self.anchor + timedelta(days=90))
        self.assertEqual(window.ends_at, self.anchor + timedelta(days=120))

    def test_display_in_colombo_crosses_local_midnight(self):
        window = free_quota_window(self.anchor.astimezone(ZoneInfo("Asia/Colombo")), self.anchor)
        self.assertEqual(window.starts_at, self.anchor)
        self.assertEqual(window.starts_at.tzinfo, UTC)
        self.assertEqual(window.resets_at_colombo.date().day, 3)
        self.assertEqual(window.resets_at_colombo.hour, 5)

    def test_rejects_pre_activation_or_ambiguous_timestamps(self):
        for anchor, at in (
            (self.anchor, self.anchor - timedelta(microseconds=1)),
            (self.anchor.replace(tzinfo=None), self.anchor),
            (self.anchor, self.anchor.replace(tzinfo=None)),
        ):
            with self.subTest(anchor=anchor, at=at), self.assertRaises(ValueError):
                free_quota_window(anchor, at)
