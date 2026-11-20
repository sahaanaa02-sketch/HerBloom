
import { useEffect, useState } from 'react'
import {
  CheckCircle2, RefreshCw, CalendarDays,
  History, ArrowLeft
} from 'lucide-react'
import { nutritionApi } from '../../services/nutritionApi'

const DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday'
]

const SLOTS = {
  breakfast: 'Breakfast',
  morning_snack: 'Morning Snack',
  lunch: 'Lunch',
  evening_snack: 'Evening Snack',
  dinner: 'Dinner',
}

export default function WeeklyMealPlan({
  token,
  plan,
  onRefresh,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [activeDate, setActiveDate] = useState('')

  const current = selectedPlan || plan

  useEffect(() => {
    if (!selectedPlan) return
    if (plan?.id === selectedPlan.id) {
      setSelectedPlan(plan)
    }
  }, [plan, selectedPlan?.id])

  useEffect(() => {
    const firstDate = current?.items?.[0]?.date || ''
    setActiveDate(firstDate)
  }, [current?.id])

  async function generate() {
    setBusy(true)
    setError('')

    try {
      await nutritionApi.generatePlan(token)
      setSelectedPlan(null)
      setShowHistory(false)
      await onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function openHistory() {
    setBusy(true)
    setError('')

    try {
      setHistory(await nutritionApi.planHistory(token))
      setShowHistory(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function openPlan(id) {
    setBusy(true)
    setError('')

    try {
      const result = await nutritionApi.planDetail(token, id)
      setSelectedPlan(result)
      setActiveDate(result?.items?.[0]?.date || '')
      setShowHistory(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function mark(item) {
    setBusy(true)
    setError('')

    try {
      await nutritionApi.markEaten(token, item.id, !item.eaten)
      await onRefresh()

      if (selectedPlan) {
        setSelectedPlan(
          await nutritionApi.planDetail(token, selectedPlan.id)
        )
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function swap(item) {
    setBusy(true)
    setError('')

    try {
      await nutritionApi.swapMeal(token, item.id)
      await onRefresh()

      if (selectedPlan) {
        setSelectedPlan(
          await nutritionApi.planDetail(token, selectedPlan.id)
        )
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const grouped = {}

  for (const item of current?.items || []) {
    if (!grouped[item.date]) grouped[item.date] = []
    grouped[item.date].push(item)
  }

  const dates = Object.keys(grouped)
  const displayDate = dates.includes(activeDate)
    ? activeDate
    : dates[0]

  function dayName(date) {
    return DAYS[new Date(`${date}T12:00:00`).getDay()]
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-6">
        <div>
          <h3 className="font-['Playfair_Display'] text-2xl text-[#7B2346]">
            My 7-Day Meal Plan
          </h3>
          <p className="mt-2 text-sm text-[#977A86]">
            Seven days · Five meal slots per day
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openHistory}
            disabled={busy}
            className="flex items-center gap-2 rounded-full border border-[#E5C8D3] px-4 py-3 text-sm text-[#7B2346]"
          >
            <History size={16} />
            Past Plans
          </button>

          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="flex items-center gap-2 rounded-full bg-[#7B2346] px-5 py-3 text-sm text-white disabled:opacity-50"
          >
            <RefreshCw size={16} />
            {busy ? 'Please wait...' : 'Generate This Week'}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {showHistory ? (
        <div className="rounded-3xl border border-[#F2DFE5] bg-white p-6">
          <h4 className="mb-5 font-['Playfair_Display'] text-xl text-[#7B2346]">
            Previous Meal Plans
          </h4>

          {history.length ? (
            <div className="space-y-3">
              {history.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => openPlan(entry.id)}
                  className="flex w-full items-center justify-between rounded-2xl bg-[#FFF6F1] p-4 text-left text-sm text-[#7B2346]"
                >
                  Week starting {entry.start_date}
                  <CalendarDays size={18} />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#977A86]">
              No previous plans available.
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowHistory(false)}
            className="mt-5 flex items-center gap-2 text-sm text-[#7B2346]"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>
      ) : (
        <>
          {selectedPlan && (
            <button
              type="button"
              onClick={() => {
                setSelectedPlan(null)
                setActiveDate('')
              }}
              className="flex items-center gap-2 text-sm text-[#7B2346]"
            >
              <ArrowLeft size={16} />
              Back to Latest Plan
            </button>
          )}

          {!current && (
            <div className="rounded-3xl border border-[#F2DFE5] bg-white p-8 text-center">
              <CalendarDays
                size={38}
                className="mx-auto mb-4 text-[#7B2346]"
              />
              <p className="text-[#7B2346]">
                Your weekly meal plan is not generated yet.
              </p>
              <p className="mt-3 text-sm text-[#977A86]">
                Reviewed food data and dietary safety checks
                are required before generating a plan.
              </p>
            </div>
          )}

          {current && (
            <>
              <div className="flex flex-wrap gap-2">
                {dates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setActiveDate(date)}
                    className={`rounded-full px-4 py-3 text-sm ${
                      displayDate === date
                        ? 'bg-[#7B2346] text-white'
                        : 'bg-[#F6D3DB] text-[#7B2346]'
                    }`}
                  >
                    {dayName(date).slice(0, 3)}
                  </button>
                ))}
              </div>

              <div className="rounded-3xl border border-[#F2DFE5] bg-white p-6">
                <h4 className="mb-5 font-['Playfair_Display'] text-xl text-[#7B2346]">
                  {displayDate
                    ? `${dayName(displayDate)} · ${displayDate}`
                    : 'Meal Plan'}
                </h4>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {(grouped[displayDate] || []).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl bg-[#FFF6F1] p-5"
                    >
                      <p className="text-xs uppercase tracking-wide text-[#A78090]">
                        {SLOTS[item.meal_type] || item.meal_type}
                      </p>

                      <p className="mt-3 font-semibold text-[#7B2346]">
                        {item.food_name}
                      </p>

                      <p className="mt-2 text-xs text-[#977A86]">
                        Suggested portion: {item.grams} g
                      </p>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => mark(item)}
                          className={`flex items-center gap-1 rounded-full px-3 py-2 text-xs ${
                            item.eaten
                              ? 'bg-[#7B2346] text-white'
                              : 'bg-[#F6D3DB] text-[#7B2346]'
                          }`}
                        >
                          <CheckCircle2 size={14} />
                          {item.eaten ? 'Eaten' : 'I Ate This'}
                        </button>

                        <button
                          type="button"
                          disabled={busy || item.eaten}
                          onClick={() => swap(item)}
                          className="rounded-full border border-[#E5C8D3] px-3 py-2 text-xs text-[#7B2346] disabled:opacity-50"
                        >
                          Swap
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      <p className="text-xs leading-6 text-[#977A86]">
        Meal plans are educational suggestions, not clinically
        validated diets. Recorded allergies, GDM history and
        individual dietary needs require professional review.
      </p>
    </div>
  )
}
