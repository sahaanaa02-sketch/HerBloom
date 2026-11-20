
import { useEffect, useState } from 'react'
import {
  Search,
  Trash2,
  Heart,
  Pencil,
  X,
} from 'lucide-react'

import { nutritionApi } from '../../services/nutritionApi'

const MEALS = [
  ['breakfast', 'Breakfast'],
  ['morning_snack', 'Morning Snack'],
  ['lunch', 'Lunch'],
  ['evening_snack', 'Evening Snack'],
  ['dinner', 'Dinner'],
]

// Sri Lanka local date in YYYY-MM-DD format
function getSriLankaDate() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  )

  return `${values.year}-${values.month}-${values.day}`
}

export default function DailyFoodLog({
  token,
  data,
  onRefresh,
}) {
  const [foods, setFoods] = useState([])
  const [favourites, setFavourites] = useState([])

  const [query, setQuery] = useState('')
  const [foodId, setFoodId] = useState('')
  const [mealType, setMealType] = useState('breakfast')
  const [grams, setGrams] = useState(150)

  const [selectedDate, setSelectedDate] = useState('')
  const [history, setHistory] = useState(null)

  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Prevent selecting future dates
  const maxDate = getSriLankaDate()

  // Today or selected historical date
  const displayed = selectedDate ? history : data

  // Load foods when searching
  useEffect(() => {
    let active = true

    async function loadFoods() {
      try {
        const result = await nutritionApi.foods(
          token,
          query
        )

        if (active) {
          setFoods(result)
        }
      } catch (err) {
        if (active) {
          setError(err.message)
        }
      }
    }

    const timer = setTimeout(loadFoods, 250)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, token])

  // Load favourites
  useEffect(() => {
    let active = true

    async function loadFavourites() {
      try {
        const result = await nutritionApi.favourites(
          token
        )

        if (active) {
          setFavourites(result)
        }
      } catch (err) {
        if (active) {
          setError(err.message)
        }
      }
    }

    loadFavourites()

    return () => {
      active = false
    }
  }, [token])

  // Load selected date food log
  useEffect(() => {
    let active = true

    if (!selectedDate) {
      setHistory(null)
      return
    }

    setHistory(null)

    async function loadHistory() {
      try {
        const result = await nutritionApi.logs(
          token,
          selectedDate
        )

        if (active) {
          setHistory(result)
        }
      } catch (err) {
        if (active) {
          setError(err.message)
        }
      }
    }

    loadHistory()

    return () => {
      active = false
    }
  }, [selectedDate, token])

  // Refresh dashboard and food journal
  async function refreshAll() {
    await onRefresh()

    if (selectedDate) {
      const result = await nutritionApi.logs(
        token,
        selectedDate
      )

      setHistory(result)
    }
  }

  // Reset add/edit form
  function resetForm() {
    setEditingId(null)
    setFoodId('')
    setMealType('breakfast')
    setGrams(150)
    setQuery('')
  }

  // Edit existing meal
  function startEdit(meal) {
    setEditingId(meal.id)
    setFoodId(String(meal.food_id))
    setMealType(meal.meal_type)
    setGrams(meal.grams)

    setQuery('')
    setError('')
    setSuccess('')
  }

  // Save new meal or update existing meal
  async function saveMeal(e) {
    e.preventDefault()

    setError('')
    setSuccess('')

    if (!foodId) {
      setError('Please select a food.')
      return
    }

    const amount = Number(grams)

    if (!Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 3000) {
      setError('Enter a valid portion between 1 and 3000 grams.')
      return
    }

    const payload = {
      food_id: Number(foodId),
      meal_type: mealType,
      grams: amount,
    }

    setBusy(true)

    try {
      if (editingId) {
        await nutritionApi.editMeal(
          token,
          editingId,
          payload
        )

        setSuccess('Meal updated successfully.')
      } else {
        await nutritionApi.addMeal(token, {
          ...payload,
          date: selectedDate || null,
        })

        setSuccess('Meal saved successfully.')
      }

      resetForm()
      await refreshAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Delete meal
  async function deleteMeal(id) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this meal?'
    )

    if (!confirmed) return

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      await nutritionApi.deleteMeal(token, id)
      await refreshAll()

      if (editingId === id) {
        resetForm()
      }

      setSuccess('Meal deleted successfully.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Add or remove favourite
  async function toggleFavourite(id) {
    setError('')

    try {
      const exists = favourites.some(
        (food) => food.id === id
      )

      if (exists) {
        await nutritionApi.removeFavourite(
          token,
          id
        )
      } else {
        await nutritionApi.addFavourite(
          token,
          id
        )
      }

      const result = await nutritionApi.favourites(
        token
      )

      setFavourites(result)
    } catch (err) {
      setError(err.message)
    }
  }

  // Keep selected food visible during editing
  const selectedFoodMissing =
    editingId &&
    foodId &&
    !foods.some(
      (food) => String(food.id) === foodId
    )

  const selectedMeal = displayed?.meals?.find(
    (meal) => meal.id === editingId
  )

  const visibleFoods = selectedFoodMissing
    ? [
        ...foods,
        {
          id: Number(foodId),
          name_en:
            selectedMeal?.food_name ||
            'Selected food',
          verified: selectedMeal?.verified ?? false,
        },
      ]
    : foods

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">

      {/* ADD OR EDIT MEAL */}
      <form
        onSubmit={saveMeal}
        className="space-y-5 rounded-3xl border border-[#F2DFE5] bg-white p-6"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-['Playfair_Display'] text-2xl text-[#7B2346]">
            {editingId ? 'Edit Meal' : 'Add a Meal'}
          </h3>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg p-2 text-[#7B2346]"
              aria-label="Cancel editing"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* SEARCH FOOD */}
        <label className="block text-sm text-[#7B2346]">
          Search food

          <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#EAD6DE] px-3">
            <Search
              size={18}
              className="text-[#7B2346]"
            />

            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setFoodId('')
              }}
              placeholder="Rice, dhal, pittu..."
              className="w-full py-3 outline-none"
            />
          </div>
        </label>

        {/* SELECT FOOD */}
        <label className="block text-sm text-[#7B2346]">
          Select food

          <select
            required
            value={foodId}
            onChange={(e) =>
              setFoodId(e.target.value)
            }
            className="mt-2 w-full rounded-xl border border-[#EAD6DE] p-3"
          >
            <option value="">
              Choose a food
            </option>

            {visibleFoods.map((food) => (
              <option
                key={food.id}
                value={food.id}
              >
                {food.name_en}
                {food.verified
                  ? ''
                  : ' (unverified)'}
              </option>
            ))}
          </select>
        </label>

        {/* MEAL TYPE */}
        <label className="block text-sm text-[#7B2346]">
          Meal type

          <select
            value={mealType}
            onChange={(e) =>
              setMealType(e.target.value)
            }
            className="mt-2 w-full rounded-xl border border-[#EAD6DE] p-3"
          >
            {MEALS.map(([value, label]) => (
              <option
                key={value}
                value={value}
              >
                {label}
              </option>
            ))}
          </select>
        </label>

        {/* PORTION */}
        <label className="block text-sm text-[#7B2346]">
          Portion in grams

          <input
            type="number"
            min="1"
            max="3000"
            step="1"
            required
            value={grams}
            onChange={(e) =>
              setGrams(e.target.value)
            }
            className="mt-2 w-full rounded-xl border border-[#EAD6DE] p-3"
          />
        </label>

        {/* ERROR MESSAGE */}
        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}

        {/* SUCCESS MESSAGE */}
        {success && (
          <p className="rounded-xl bg-[#FFF6F1] p-3 text-sm text-[#7B2346]">
            {success}
          </p>
        )}

        {/* SAVE BUTTON */}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-[#7B2346] py-3 font-semibold text-white transition hover:bg-[#5C1935] disabled:opacity-50"
        >
          {busy
            ? 'Saving...'
            : editingId
              ? 'Update Meal'
              : 'Save Meal'}
        </button>

        <p className="text-xs leading-5 text-[#977A86]">
          Food portions are estimates. Nutrient totals
          use only verified food data. Missing nutrient
          values do not mean zero intake.
        </p>
      </form>

      {/* RIGHT SIDE */}
      <div className="space-y-5">

        {/* FOOD JOURNAL */}
        <div className="rounded-3xl border border-[#F2DFE5] bg-white p-6">
          <h3 className="mb-5 font-['Playfair_Display'] text-xl text-[#7B2346]">
            Food Journal
          </h3>

          {/* DATE PICKER */}
          <label className="block text-sm text-[#795C69]">
            View date

            <input
              type="date"
              max={maxDate}
              value={selectedDate}
              onChange={(e) => {
                const nextDate = e.target.value

                if (
                  !nextDate ||
                  nextDate <= maxDate
                ) {
                  setSelectedDate(nextDate)
                  resetForm()
                  setError('')
                  setSuccess('')
                }
              }}
              className="mt-2 w-full rounded-xl border border-[#EAD6DE] p-3"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              setSelectedDate('')
              resetForm()
              setError('')
            }}
            className="mt-3 text-xs font-semibold text-[#7B2346] hover:underline"
          >
            View Today
          </button>

          <p className="mt-3 text-xs text-[#977A86]">
            {selectedDate
              ? `Showing meals for ${selectedDate}`
              : `Showing today's meals (${maxDate})`}
          </p>

          {/* FOOD LOG ITEMS */}
          {!displayed?.meals?.length ? (
            <p className="mt-5 rounded-xl bg-[#FFF6F1] p-5 text-sm text-[#977A86]">
              No meals recorded for this date.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {displayed.meals.map((meal) => (
                <div
                  key={meal.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-[#FFF6F1] p-4"
                >
                  <div>
                    <p className="font-semibold text-[#7B2346]">
                      {meal.food_name}
                    </p>

                    <p className="mt-1 text-xs text-[#947684]">
                      {meal.meal_type.replaceAll(
                        '_',
                        ' '
                      )}
                      {' · '}
                      {meal.grams} g
                    </p>

                    <p className="mt-1 text-xs text-[#947684]">
                      {meal.verified &&
                      meal.nutrients
                        ? `${meal.nutrients.calories} kcal`
                        : 'Nutrient data unavailable'}
                    </p>
                  </div>

                  <div className="flex gap-1">
                    {/* EDIT */}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        startEdit(meal)
                      }
                      className="rounded-lg p-2 text-[#7B2346] hover:bg-[#F6D3DB] disabled:opacity-50"
                      aria-label="Edit meal"
                    >
                      <Pencil size={17} />
                    </button>

                    {/* DELETE */}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        deleteMeal(meal.id)
                      }
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-50"
                      aria-label="Delete meal"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FOOD FAVOURITES */}
        <div className="rounded-3xl border border-[#F2DFE5] bg-white p-6">
          <h3 className="mb-4 font-['Playfair_Display'] text-xl text-[#7B2346]">
            Food Favourites
          </h3>

          <div className="max-h-64 space-y-2 overflow-y-auto">
            {foods.length === 0 ? (
              <p className="text-sm text-[#977A86]">
                No foods available.
              </p>
            ) : (
              foods.map((food) => {
                const favourite = favourites.some(
                  (f) => f.id === food.id
                )

                return (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() =>
                      toggleFavourite(food.id)
                    }
                    className="flex w-full items-center justify-between rounded-xl bg-[#FFF6F1] px-4 py-3 text-left text-sm text-[#7B2346] transition hover:bg-[#F6D3DB]"
                  >
                    <span>
                      {food.name_en}
                    </span>

                    <Heart
                      size={18}
                      className="shrink-0"
                      fill={
                        favourite
                          ? '#7B2346'
                          : 'none'
                      }
                    />
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
