
import {
  Check,
  Heart,
  ArrowRight,
  Sparkles,
  BookOpen,
  Bell,
  ShieldCheck,
  Flower2,
} from 'lucide-react'

export default function OnboardingSuccess({
  userName = '',
  reminders = [],
  onGoToDashboard,
}) {
  const displayName = userName?.trim() || 'there'

  const hasReminders =
    Array.isArray(reminders) && reminders.length > 0

  return (
    <div className="flex min-h-full flex-col items-center justify-center py-5 text-center">
      {/* SUCCESS ICON */}
      <div className="relative mb-6">
        <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#F6D3DB] bg-[#FBE7EC] shadow-sm">
          <Heart
            size={44}
            fill="#7B2346"
            className="text-[#7B2346]"
          />
        </div>

        <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-[#7B2346] text-white">
          <Check size={19} strokeWidth={3} />
        </span>
      </div>

      {/* SUCCESS TITLE */}
      <div className="mb-6 max-w-md">
        <div className="mb-3 flex items-center justify-center gap-2 text-[#D9A25B]">
          <Sparkles size={18} />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">
            Welcome to HerBloom
          </span>
          <Sparkles size={18} />
        </div>

        <h1 className="font-['Playfair_Display'] text-[clamp(28px,3vw,39px)] font-semibold leading-tight text-[#7B2346]">
          You're all set,
          <span className="block">{displayName}! 🌸</span>
        </h1>

        <p className="mt-3 text-sm leading-7 text-[#765363]">
          Your HerBloom profile is ready.
          Your recovery journey, supported with care,
          begins here.
        </p>
      </div>

      {/* NEXT STEPS */}
      <div className="w-full max-w-md space-y-3 text-left">
        <div className="flex items-start gap-3 rounded-2xl border border-[#F1D9DF] bg-white p-4 shadow-sm">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FCE7EB] text-[#7B2346]">
            <BookOpen size={21} />
          </span>

          <div>
            <h3 className="text-sm font-semibold text-[#3A1224]">
              Start with your recovery guide
            </h3>

            <p className="mt-1 text-xs leading-5 text-[#765363]">
              Explore general postpartum recovery information
              based on your stage after birth.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-[#F1D9DF] bg-white p-4 shadow-sm">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FCE7EB] text-[#7B2346]">
            <Flower2 size={21} />
          </span>

          <div>
            <h3 className="text-sm font-semibold text-[#3A1224]">
              Your journey, your pace
            </h3>

            <p className="mt-1 text-xs leading-5 text-[#765363]">
              Explore your dashboard, check in with yourself,
              and update your preferences whenever you like.
            </p>
          </div>
        </div>

        {hasReminders && (
          <div className="flex items-start gap-3 rounded-2xl border border-[#F1D9DF] bg-white p-4 shadow-sm">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FCE7EB] text-[#7B2346]">
              <Bell size={21} />
            </span>

            <div>
              <h3 className="text-sm font-semibold text-[#3A1224]">
                Your reminder preferences are saved
              </h3>

              <p className="mt-1 text-xs leading-5 text-[#765363]">
                You can manage your reminder choices in
                Settings. Notifications will become available
                when the notification service is connected.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* DASHBOARD BUTTON */}
      <button
        type="button"
        onClick={onGoToDashboard}
        className="mt-7 flex min-h-12 w-full max-w-md items-center justify-center gap-3 rounded-full bg-[#7B2346] px-7 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#651C39] focus:outline-none focus:ring-4 focus:ring-[#F6D3DB]"
      >
        Go to My Dashboard
        <ArrowRight size={19} />
      </button>

      {/* PRIVACY NOTE */}
      <div className="mt-6 flex max-w-md items-start justify-center gap-2 text-center text-xs leading-5 text-[#8B6B77]">
        <ShieldCheck size={16} className="shrink-0" />
        <p>
          Your information is personal. You can review
          your profile and privacy preferences in Settings.
        </p>
      </div>
    </div>
  )
}
