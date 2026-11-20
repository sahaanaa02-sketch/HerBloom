import { useRef, useState } from 'react'
import { Camera, X, Loader2 } from 'lucide-react'
import { nutritionApi } from '../../services/nutritionApi'

export default function MealScanner({
  token,
  onClose,
  onSaved,
}) {
  const [file, setFile] = useState(null)
  const scanRequest = useRef(null)
  const [preview, setPreview] = useState('')
  const [items, setItems] = useState([])
  const [foods, setFoods] = useState([])
  const [mealType, setMealType] = useState('lunch')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  function chooseFile(e) {
    const selected = e.target.files?.[0]
    if (!selected) return

    if (preview) URL.revokeObjectURL(preview)

    scanRequest.current = { key: crypto.randomUUID(), result: null }
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
    setItems([])
    setError('')
  }

  async function scan() {
    if (busy) return
    if (!file || !consent) {
      setError('Select a photo and confirm consent.')
      return
    }

    setBusy(true)
    setError('')

    try {
      const request = scanRequest.current
      const result = request.result ?? await nutritionApi.scan(token, file, request.key)
      request.result = result
      const catalog = await nutritionApi.foods(token)

      const indexed = new Map(catalog.map((food) => [food.id, food]))
      const matchedItems = await Promise.all(result.items.map(async (item) => {
        const name = item.name.toLowerCase()
        let matched = catalog.find((food) => food.name_en.toLowerCase() === name)
        // A scanner alias can map to a food beyond the initial catalog page.
        if (!matched) {
          const candidates = await nutritionApi.foods(token, item.name).catch(() => [])
          matched = candidates.find((food) => food.name_en.toLowerCase() === name)
        }
        if (matched) indexed.set(matched.id, matched)
        return { ...item, food_id: matched?.id || '' }
      }))
      setFoods([...indexed.values()])
      setMessage(result.message)
      setItems(matchedItems)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function edit(index, key, value) {
    setItems((previous) =>
      previous.map((item, i) =>
        i === index ? { ...item, [key]: value } : item
      )
    )
  }

  async function save() {
    if (!items.length) return

    if (items.some((item) => !item.food_id)) {
      setError(
        'Match every scanned item with a catalog food before saving.'
      )
      return
    }

    setBusy(true)
    setError('')

    try {
      for (const item of items) {
        await nutritionApi.addMeal(token, {
          food_id: Number(item.food_id),
          meal_type: mealType,
          grams: Number(item.estimated_grams),
        })
      }

      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#2C0E1C]/70 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-['Playfair_Display'] text-2xl text-[#7B2346]">
            AI Food Scanner
          </h2>

          <button type="button" onClick={onClose}>
            <X size={23} />
          </button>
        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[#E5B8C7] bg-[#FFF6F1] p-8 text-center">
          <Camera size={34} className="mb-3 text-[#7B2346]" />

          <span className="font-medium text-[#7B2346]">
            Upload a food photo
          </span>

          <span className="mt-2 text-xs text-[#977A86]">
            JPG, PNG or WebP · Maximum 5 MB
          </span>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={chooseFile}
            className="hidden"
          />
        </label>

        {preview && (
          <img
            src={preview}
            alt="Selected food"
            className="mx-auto mt-4 max-h-48 rounded-2xl object-contain"
          />
        )}

        <label className="mt-5 flex items-start gap-3 text-xs leading-6 text-[#795C69]">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />

          I agree to send this food image to Google's Gemini
          service for AI analysis. I understand that the
          estimates may be inaccurate.
        </label>

        <button
          type="button"
          onClick={scan}
          disabled={busy || !file || !consent}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#7B2346] py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Camera size={18} />}
          {busy ? 'Processing...' : 'Analyse Food'}
        </button>

        {message && (
          <p className="mt-4 text-xs text-[#977A86]">{message}</p>
        )}

        {items.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="font-semibold text-[#7B2346]">
              Review AI Results
            </h3>

            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value)}
              className="w-full rounded-xl border p-3"
            >
              {[
                'breakfast', 'morning_snack', 'lunch',
                'evening_snack', 'dinner'
              ].map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </select>

            {items.map((item, index) => (
              <div
                key={index}
                className="space-y-3 rounded-2xl bg-[#FFF6F1] p-4"
              >
                <p className="font-medium text-[#7B2346]">
                  AI identified: {item.name}
                </p>

                <p className="text-xs text-[#977A86]">
                  Confidence: {item.confidence}
                </p>

                <select
                  value={item.food_id}
                  onChange={(e) =>
                    edit(index, 'food_id', e.target.value)
                  }
                  className="w-full rounded-xl border p-3 text-sm"
                >
                  <option value="">Match with food catalog</option>
                  {foods.map((food) => (
                    <option key={food.id} value={food.id}>
                      {food.name_en}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="1"
                  max="3000"
                  value={item.estimated_grams}
                  onChange={(e) =>
                    edit(index, 'estimated_grams', e.target.value)
                  }
                  className="w-full rounded-xl border p-3 text-sm"
                />

                <p className="text-xs text-[#977A86]">
                  Estimated portion in grams — please correct it.
                </p>
              </div>
            ))}

            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="w-full rounded-full bg-[#7B2346] py-3 font-semibold text-white disabled:opacity-50"
            >
              Confirm and Save Meal
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}
      </div>
    </div>
  )
}