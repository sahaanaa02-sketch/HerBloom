
import { useState } from 'react'
import { HeartPulse, Trash2 } from 'lucide-react'
import { nutritionApi } from '../../services/nutritionApi'

export default function AnaemiaCard({
  token,
  data,
  onRefresh,
}) {
  const [value, setValue] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')

    try {
      await nutritionApi.saveHb(token, {
        value: Number(value),
        date: date || null,
      })

      setValue('')
      setDate('')
      await onRefresh()
      setSuccess('Hb result saved successfully.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteRecord(id) {
    if (!window.confirm('Delete this Hb result?')) return

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      await nutritionApi.deleteHb(token, id)
      await onRefresh()
      setSuccess('Hb result deleted.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const maxDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-3xl border border-[#F2DFE5] bg-white p-6">
        <div className="mb-5 flex items-center gap-3">
          <HeartPulse size={26} className="text-[#7B2346]" />
          <h3 className="font-['Playfair_Display'] text-2xl text-[#7B2346]">
            Anaemia Care
          </h3>
        </div>

        <p className="text-sm text-[#795C69]">
          Anaemia history: {data?.anaemia_history || 'Not recorded'}
        </p>

        <p className="mt-2 text-sm text-[#795C69]">
          Iron treatment recorded: {data?.iron_prescribed || 'Not recorded'}
        </p>

        <form onSubmit={save} className="mt-6 space-y-4">
          <h4 className="font-semibold text-[#7B2346]">
            Record Hb Result
          </h4>

          <label className="block text-sm text-[#795C69]">
            Haemoglobin (g/dL)
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="30"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-2 w-full rounded-xl border border-[#EBD7DF] p-3"
            />
          </label>

          <label className="block text-sm text-[#795C69]">
            Test date
            <input
              type="date"
              max={maxDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-2 w-full rounded-xl border border-[#EBD7DF] p-3"
            />
          </label>

          <button
            disabled={busy}
            className="rounded-full bg-[#7B2346] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save Hb Result'}
          </button>
        </form>

        {error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}
        {success && (
          <p className="mt-3 text-sm text-[#7B2346]">{success}</p>
        )}

        <div className="mt-7 rounded-2xl bg-[#FFF6F1] p-5">
          <h4 className="font-semibold text-[#7B2346]">
            About Your Hb Results
          </h4>
          <p className="mt-2 text-sm leading-6 text-[#795C69]">
            Keep a record of your laboratory results and
            discuss them with your healthcare professional.
            HerBloom does not interpret Hb values or
            recommend changes to prescribed treatment.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-3xl border border-[#F2DFE5] bg-white p-6">
          <h3 className="mb-4 font-['Playfair_Display'] text-xl text-[#7B2346]">
            Hb History
          </h3>

          {data?.hb_records?.length ? (
            <div className="space-y-3">
              {data.hb_records.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between rounded-xl bg-[#FFF6F1] p-4 text-sm"
                >
                  <div>
                    <p className="text-[#795C69]">
                      {record.date}
                    </p>
                    <strong className="text-[#7B2346]">
                      {record.value} g/dL
                    </strong>
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => deleteRecord(record.id)}
                    className="rounded-lg p-2 text-red-500 disabled:opacity-50"
                    aria-label="Delete Hb record"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#977A86]">
              No Hb results recorded.
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-[#F2DFE5] bg-white p-6">
          <h3 className="mb-4 font-['Playfair_Display'] text-xl text-[#7B2346]">
            Iron-Rich Food Ideas
          </h3>

          {data?.iron_foods?.length ? (
            data.iron_foods.map((food) => (
              <div
                key={food.id}
                className="mb-2 rounded-xl bg-[#FFF6F1] p-3"
              >
                <p className="font-medium text-[#7B2346]">
                  {food.name_en}
                </p>
                <p className="mt-1 text-xs text-[#795C69]">
                  {food.iron} mg iron / 100 g
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-[#977A86]">
              Reviewed food data is not available yet.
            </p>
          )}
        </div>

        <p className="text-xs leading-6 text-[#977A86]">
          Hb records are for tracking only. Consult a qualified
          healthcare professional for interpretation and treatment.
        </p>
      </div>
    </div>
  )
}
