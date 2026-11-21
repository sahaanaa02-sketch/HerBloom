import { useTranslation } from 'react-i18next'

import { useState } from 'react'
import {
  CheckCircle2,
  RotateCcw,
} from 'lucide-react'

import ExerciseDisclaimer from './ExerciseDisclaimer'

export default function ExerciseAccess({
  children,
  onContinue,
}) {
  const { t: auditText } = useTranslation()
  const [accepted, setAccepted] = useState(false)

  function handleAccept() {
    setAccepted(true)

    if (typeof onContinue === 'function') {
      onContinue()
    }
  }

  if (accepted) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#F6D3DB] bg-[#FFF6F1] px-5 py-4">
          <div className="flex items-center gap-3">
            <CheckCircle2
              size={20}
              className="text-[#7B2346]"
            />

            <div>
              <p className="text-sm font-semibold text-[#3A1224]">
                {auditText('common:safety_notice_acknowledged')}
              </p>

              <p className="text-xs text-[#765363]">
                Your individual activity restrictions still apply.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAccepted(false)}
            className="flex items-center gap-2 text-xs font-semibold text-[#7B2346]"
          >
            <RotateCcw size={15} />
            {auditText('common:review_notice')}
          </button>
        </div>

        {children}
      </div>
    )
  }

  return (
    <div className="flex min-h-[480px] items-center justify-center rounded-[28px] border border-[#F1DEE5] bg-[#FFF6F1] p-6">
      <ExerciseDisclaimer
        onAccept={handleAccept}
      />
    </div>
  )
}
