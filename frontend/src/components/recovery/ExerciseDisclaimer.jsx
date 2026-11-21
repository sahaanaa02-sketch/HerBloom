import { useTranslation } from 'react-i18next'

import { useState } from 'react'
import {
  ShieldCheck,
  AlertTriangle,
  Heart,
  ArrowRight,
  X,
} from 'lucide-react'

export default function ExerciseDisclaimer({
  onAccept,
  onClose,
}) {
  const { t: auditText } = useTranslation()
  const [understood, setUnderstood] = useState(false)

  const handleContinue = () => {
    if (!understood) return

    if (typeof onAccept === 'function') {
      onAccept()
    }
  }

  return (
    <div className="w-full max-w-xl rounded-[28px] border border-[#F6D3DB] bg-white p-8 shadow-xl">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">

        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0F3]">
          <ShieldCheck
            size={28}
            color="#7B2346"
          />
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={auditText('common:close_disclaimer')}
            className="rounded-full p-2 text-[#7B2346] transition hover:bg-[#FFF0F3]"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Title */}
      <h2
        className="mb-3 text-3xl font-semibold text-[#3A1224]"
        style={{
          fontFamily: "'Playfair Display', serif",
        }}
      >
        {auditText('common:before_you_begin')}
      </h2>

      <p className="mb-6 text-sm leading-7 text-[#765363]">
        Your recovery is unique. Please read this
        important information before exploring
        postpartum exercises.
      </p>

      {/* Disclaimer */}
      <div className="rounded-2xl border border-[#F6D3DB] bg-[#FFF6F1] p-5">

        <div className="mb-3 flex items-center gap-2">
          <Heart
            size={19}
            color="#7B2346"
          />

          <h3 className="font-semibold text-[#3A1224]">
            {auditText('common:a_gentle_reminder_2')}
          </h3>
        </div>

        <p className="text-sm leading-7 text-[#765363]">
          These exercises are for general postpartum
          education and do not replace medical advice.
          Follow your healthcare professional's
          guidance. Stop if you experience pain,
          dizziness, increased bleeding, or unusual
          discomfort.
        </p>
      </div>

      {/* Safety Note */}
      <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#FFF0F3] p-4">

        <AlertTriangle
          size={20}
          color="#7B2346"
          className="mt-0.5 shrink-0"
        />

        <p className="text-xs leading-6 text-[#765363]">
          If you have activity restrictions, recent
          concerning symptoms, or have not received
          required professional clearance, do not
          begin restricted activities. Acknowledging
          this notice does not provide medical clearance.
        </p>
      </div>

      {/* Consent */}
      <label className="mt-6 flex cursor-pointer items-start gap-3">

        <input
          type="checkbox"
          checked={understood}
          onChange={(event) =>
            setUnderstood(event.target.checked)
          }
          className="mt-1 h-4 w-4 accent-[#7B2346]"
        />

        <span className="text-sm leading-6 text-[#3A1224]">
          I understand that this information is
          educational and that I should follow
          my healthcare professional's advice.
        </span>
      </label>

      {/* Continue */}
      <button
        type="button"
        disabled={!understood}
        onClick={handleContinue}
        className={`mt-7 flex w-full items-center justify-center gap-3 rounded-full px-6 py-4 text-sm font-semibold transition ${
          understood
            ? 'bg-[#7B2346] text-white hover:bg-[#3A1224]'
            : 'cursor-not-allowed bg-[#F6D3DB] text-[#9B7886]'
        }`}
      >
        {auditText('common:explore_exercise_library')}

        <ArrowRight size={18} />
      </button>

      <p className="mt-4 text-center text-xs text-[#977685]">
        {auditText('common:herbloom_supporting_your_recovery_journey')}
      </p>

    </div>
  )
}
