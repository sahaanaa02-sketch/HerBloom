import { useTranslation } from 'react-i18next'

import { useState } from 'react'
import {
  Heart,
  ShieldCheck,
} from 'lucide-react'

import MyRecoveryContent from './MyRecoveryContent'
import ExerciseDisclaimer from '../../components/recovery/ExerciseDisclaimer'

export default function MyRecovery(props) {
  const { t: auditText } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  function handleAccept() {
    setAcknowledged(true)
    setShowDisclaimer(false)
  }

  function handleClose() {
    setShowDisclaimer(false)
  }

  return (
    <div className="relative">

      {/* Existing My Recovery page */}
      <MyRecoveryContent {...props} />

      {/* Exercise safety notice */}
      {showDisclaimer && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto overscroll-contain bg-[#3A1224]/50 p-3 sm:p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={uiText('exercise_safety_information')}
        >
          <ExerciseDisclaimer
            onAccept={handleAccept}
            onClose={handleClose}
          />
        </div>
      )}

      {/* Exercise disclaimer access */}
      {!acknowledged && (
        <button
          type="button"
          onClick={() => setShowDisclaimer(true)}
          className="fixed bottom-4 right-4 z-40 flex min-h-11 max-w-[calc(100vw-2rem)] items-center gap-2 sm:bottom-6 sm:right-6 sm:gap-3 rounded-full border border-[#F6D3DB] bg-white px-5 py-3 text-sm font-semibold text-[#7B2346] shadow-lg transition hover:bg-[#FFF6F1]"
        >
          <ShieldCheck size={20} />
          {auditText('common:exercise_safety_information_2')}
        </button>
      )}

      {acknowledged && (
        <div
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-[#F6D3DB] bg-white px-4 py-2 text-xs text-[#7B2346] shadow-md"
        >
          <Heart size={16} />
          {auditText('common:safety_notice_acknowledged_2')}
        </div>
      )}

    </div>
  )
}
