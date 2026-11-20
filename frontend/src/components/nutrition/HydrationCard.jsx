import { useState } from 'react'
import { Droplets, Plus } from 'lucide-react'
import { nutritionApi } from '../../services/nutritionApi'

export default function HydrationCard({
  token,
  glasses = 0,
  onRefresh,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function addWater() {
    setBusy(true)
    setError('')

    try {
      await nutritionApi.addWater(token, 1)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-3xl border border-[#F2DFE5] bg-white p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-[#E6F3FC] p-3 text-[#5397C9]">
          <Droplets size={25} />
        </div>

        <div>
          <h3 className="font-['Playfair_Display'] text-xl text-[#7B2346]">
            Hydration
          </h3>

          <p className="text-xs text-[#977A86]">
            Synced with your Dashboard
          </p>
        </div>
      </div>

      <p className="mt-6 text-3xl font-bold text-[#7B2346]">
        {glasses}
        <span className="ml-2 text-sm font-normal text-[#977A86]">
          glasses recorded today
        </span>
      </p>

      <button
        type="button"
        onClick={addWater}
        disabled={busy}
        className="mt-5 flex items-center gap-2 rounded-full bg-[#7B2346] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        <Plus size={17} />
        Add One Glass
      </button>

      {error && (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      )}

      <p className="mt-4 text-xs text-[#977A86]">
        Your hydration needs may vary. Follow advice from your
        healthcare professional if you have fluid restrictions.
      </p>
    </div>
  )
}