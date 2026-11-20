
import { useState } from 'react'
import {
  Activity,
  Heart,
  ShieldCheck,
} from 'lucide-react'

import MyRecoveryContent from './MyRecoveryContent'
import ExerciseDisclaimer from '../../components/recovery/ExerciseDisclaimer'

const COLORS = {
  berry: '#7B2346',
  burgundy: '#3A1224',
  cream: '#FFF6F1',
  pink: '#F6D3DB',
}

export default function MyRecovery(props) {
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
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-[#3A1224]/50 p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Exercise safety information"
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
          className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full border border-[#F6D3DB] bg-white px-5 py-3 text-sm font-semibold text-[#7B2346] shadow-lg transition hover:bg-[#FFF6F1]"
        >
          <ShieldCheck size={20} />
          Exercise Safety Information
        </button>
      )}

      {acknowledged && (
        <div
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-[#F6D3DB] bg-white px-4 py-2 text-xs text-[#7B2346] shadow-md"
        >
          <Heart size={16} />
          Safety notice acknowledged
        </div>
      )}

    </div>
  )
}
