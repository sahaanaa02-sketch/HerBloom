import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { Camera, X, Loader2 } from 'lucide-react'
import { requestEntitlement } from '../../services/entitlementApi'
import { nutritionApi } from '../../services/nutritionApi'

const scannerKeys = {
  "Plan": "scanner_plan",
  "Scans remaining": "scanner_scans_remaining",
  "View upgrade options": "scanner_view_upgrade_options",
  "AI Food Scanner": "scanner_ai_food_scanner",
  "Close scanner": "scanner_close_scanner",
  "Upload a food photo": "scanner_upload_a_food_photo",
  "JPG, PNG or WebP · Maximum 5 MB": "scanner_jpg_png_or_webp_maximum_5_mb",
  "Replace photo": "scanner_replace_photo",
  "Browse files": "scanner_browse_files",
  "Take photo": "scanner_take_photo",
  "Selected food": "scanner_selected_food",
  "Remove photo": "scanner_remove_photo",
  "Processing...": "scanner_processing",
  "Analyze my meal": "scanner_analyze_my_meal",
  "Review AI Results": "scanner_review_ai_results",
  "Meal type": "scanner_meal_type",
  "Catalog food": "scanner_catalog_food",
  "Match with food catalog": "scanner_match_with_food_catalog",
  "Portion in grams": "scanner_portion_in_grams",
  "Estimated portion in grams — please correct it.": "scanner_estimated_portion_in_grams_please_correct_it",
  "Saved to Food Diary": "scanner_saved_to_food_diary",
  "Remove item": "scanner_remove_item",
  "Add food": "scanner_add_food",
  "Estimated meal nutrition": "scanner_estimated_meal_nutrition",
  "Confirm and Save Meal": "scanner_confirm_and_save_meal",
  "Choose a JPG, PNG or WebP photo up to 5 MB.": "scanner_choose_a_jpg_png_or_webp_photo_up_to_5_mb",
  "Select a photo and confirm consent.": "scanner_select_a_photo_and_confirm_consent",
  "No food was identified. Add an item from the catalog or choose another photo.": "scanner_no_food_was_identified_add_an_item_from_the_catalog_or_choose_another_photo",
  "Choose a catalog food and enter a portion from 1 to 3000 grams for every item.": "scanner_choose_a_catalog_food_and_enter_a_portion_from_1_to_3000_grams_for_every_item",
  "AI estimates may be inaccurate. Review every food and portion before saving.": "scanner_ai_estimates_may_be_inaccurate_review_every_food_and_portion_before_saving",
  "Low confidence. Confirm this food before saving.": "scanner_low_confidence_confirm_this_food_before_saving",
  "Added manually.": "scanner_added_manually",
  "AI identified": "scanner_ai_identified",
  "Confidence": "scanner_confidence",
  "Unknown": "common:unknown",
  "Calories (kcal)": "scanner_calories_kcal",
  "Protein (g)": "scanner_protein_g",
  "Carbohydrates (g)": "scanner_carbohydrates_g",
  "Fat (g)": "scanner_fat_g",
  "Fibre (g)": "scanner_fibre_g",
  "Iron (mg)": "scanner_iron_mg",
  "Per-item nutrition": "scanner_per_item_nutrition",
  "I agree to send this food image to Google's Gemini service for AI analysis. I understand that the estimates may be inaccurate.": "scanner_i_agree_to_send_this_food_image_to_google_s_gemini_service_for_ai_analysis_i_understand_that_the_estimates_may_be_inaccurate",
  "Sign in again to continue.": "scanner_sign_in_again_to_continue",
  "Your scan allowance has been reached.": "scanner_your_scan_allowance_has_been_reached",
  "The image or meal details could not be accepted. Check them and try again.": "scanner_the_image_or_meal_details_could_not_be_accepted_check_them_and_try_again",
  "The request could not be completed. Please try again.": "scanner_the_request_could_not_be_completed_please_try_again",
  "A scan request is already complete or in progress.": "scanner_a_scan_request_is_already_complete_or_in_progress",
  "Meal saving is temporarily unavailable. Please retry.": "scanner_meal_saving_is_temporarily_unavailable_please_retry",
  "This save request conflicts with an earlier save.": "scanner_this_save_request_conflicts_with_an_earlier_save"
}

const optionKeys = {
  "breakfast": "scanner_breakfast",
  "morning_snack": "scanner_morning_snack",
  "lunch": "scanner_lunch",
  "evening_snack": "scanner_evening_snack",
  "dinner": "scanner_dinner",
  "free": "scanner_free",
  "trial": "scanner_trial",
  "premium": "scanner_premium",
  "medium": "scanner_medium",
  "high": "scanner_high"
}

const nutrientFields = [
  ['calories', 'Calories (kcal)'], ['protein', 'Protein (g)'],
  ['carbs_g', 'Carbohydrates (g)'], ['fat_g', 'Fat (g)'],
  ['fibre_g', 'Fibre (g)'], ['iron', 'Iron (mg)'],
]

function requestError(error, saving) {
  if ([401, 403].includes(error.status)) return 'Sign in again to continue.'
  if (error.status === 429) return 'Your scan allowance has been reached.'
  if ([400, 404, 413, 415, 422].includes(error.status)) {
    return 'The image or meal details could not be accepted. Check them and try again.'
  }
  if (error.status === 409) {
    return saving ? 'This save request conflicts with an earlier save.' :
      'A scan request is already complete or in progress.'
  }
  return saving ? 'Meal saving is temporarily unavailable. Please retry.' :
    'The request could not be completed. Please try again.'
}

export default function MealScanner({
  token,
  onClose,
  onSaved,
  onViewPlan,
}) {
  const { t, i18n } = useTranslation('mother')
  const language = i18n.resolvedLanguage
  const [analyzed, setAnalyzed] = useState(false)
  const [plan, setPlan] = useState(null)
  const [file, setFile] = useState(null)
  const scanRequest = useRef(null)
  const upload = useRef(null)
  const browse = useRef(null)
  const dialog = useRef(null)
  const saving = useRef(false)
  const translate = (label) => Object.hasOwn(scannerKeys, label) ? t(scannerKeys[label]) : label
  const optionLabel = (value) => Object.hasOwn(optionKeys, value) ? t(optionKeys[value]) : value
  const [preview, setPreview] = useState('')
  const [items, setItems] = useState([])
  const [foods, setFoods] = useState([])
  const [mealType, setMealType] = useState('lunch')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  useEffect(() => {
    let active = true
    requestEntitlement(token, '/api/features/entitlements').then(value => {
      if (active) setPlan(value)
    }).catch(() => {})
    return () => { active = false }
  }, [token])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function chooseFile(selected) {
    if (busy || !selected || items.some(item => item.savePayload)) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG or WebP photo up to 5 MB.')
      return
    }
    setAnalyzed(false)
    setMessage('')
    setConsent(false)

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
        return { ...item, key: crypto.randomUUID(), food_id: matched?.id || '' }
      }))
      setFoods([...indexed.values()])
      setMessage(matchedItems.length ? 'AI estimates may be inaccurate. Review every food and portion before saving.' : 'No food was identified. Add an item from the catalog or choose another photo.')
      setItems(matchedItems)
      setAnalyzed(true)
      requestEntitlement(token, '/api/features/entitlements').then(setPlan).catch(() => {})
    } catch (err) {
      setError(requestError(err, false))
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
    if (!items.length || saving.current) return

    if (items.some((item) => !item.food_id || !(Number(item.estimated_grams) >= 1 && Number(item.estimated_grams) <= 3000))) {
      setError(
        'Choose a catalog food and enter a portion from 1 to 3000 grams for every item.'
      )
      return
    }

    setBusy(true)
    setError('')

    saving.current = true
    try {
      for (const [index, item] of items.entries()) {
        if (item.saved) continue
        const payload = item.savePayload ?? {
          food_id: Number(item.food_id),
          meal_type: mealType,
          grams: Number(item.estimated_grams),
        }
        edit(index, 'savePayload', payload)
        try {
          await nutritionApi.addMeal(token, payload, item.key)
        } catch (error) {
          // Validation errors are definitive. Network and server failures may hide a commit.
          if ([400, 404, 422].includes(error.status)) edit(index, 'savePayload', null)
          throw error
        }
        edit(index, 'saved', true)
      }

      await onSaved()
      onClose()
    } catch (err) {
      setError(requestError(err, true))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  function nutrientAmount(item, field) {
    const food = foods.find(candidate => candidate.id === Number(item.food_id))
    const grams = Number(item.estimated_grams)
    return food?.verified && Number.isFinite(food[field]) && grams >= 1 && grams <= 3000
      ? food[field] * grams / 100 : null
  }

  function nutritionList(rows) {
    return (
      <dl className="mt-2 grid grid-cols-2 gap-2 break-words text-sm">
        {nutrientFields.map(([field, label]) => {
          const values = rows.map(item => nutrientAmount(item, field))
          const total = values.every(value => value !== null) ? values.reduce((sum, value) => sum + value, 0) : null
          return <div key={field}><dt>{translate(label)}</dt><dd className="font-semibold">{total?.toFixed(1) ?? translate('Unknown')}</dd></div>
        })}
      </dl>
    )
  }

  return (
    <dialog ref={dialog} lang={language === 'ta' ? 'ta' : 'en'} aria-labelledby="meal-scanner-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }} className="m-auto max-h-[90dvh] w-[min(94vw,42rem)] rounded-3xl bg-white backdrop:bg-[#2C0E1C]/70">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 id="meal-scanner-title" className="font-['Playfair_Display'] text-2xl text-[#7B2346]">
            {translate('AI Food Scanner')}
          </h2>

          <button type="button" aria-label={translate('Close scanner')} disabled={busy} onClick={onClose}>
            <X size={23} />
          </button>
        </div>

        {plan && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FFF6F1] p-3 text-sm text-[#7B2346]">
          <p>{translate('Plan')}: {optionLabel(plan.plan)} · {translate('Scans remaining')}: {plan.remaining.scan}</p>
          {plan.remaining.scan === 0 && onViewPlan && <button type="button" onClick={onViewPlan} className="font-semibold underline">
            {translate('View upgrade options')}
          </button>}
        </div>}
        <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]) }} className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[#E5B8C7] bg-[#FFF6F1] p-8 text-center">
          <Camera size={34} className="mb-3 text-[#7B2346]" />

          <span className="font-medium text-[#7B2346]">
            {translate('Upload a food photo')}
          </span>

          <span className="mt-2 text-xs text-[#977A86]">
            {translate('JPG, PNG or WebP · Maximum 5 MB')}
          </span>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            ref={upload}
            onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = '' }}
            className="hidden"
          />
          <button ref={browse} type="button" disabled={busy || items.some(item => item.savePayload)} onClick={() => upload.current.click()} className="mt-3 rounded-xl bg-[#7B2346] px-4 py-2 text-white">
            {preview ? translate('Replace photo') : translate('Browse files')}
          </button>
          <label className="mt-2 cursor-pointer underline focus-within:outline">
            {translate('Take photo')}
            <input type="file" accept="image/*" capture="environment" disabled={busy || items.some(item => item.savePayload)} className="sr-only"
              onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = '' }} />
          </label>
        </div>

        {preview && (
          <img
            src={preview}
            alt={translate('Selected food')}
            className="mx-auto mt-4 max-h-48 rounded-2xl object-contain"
          />
        )}

        {preview && <button type="button" disabled={busy || items.some(item => item.savePayload)} className="mt-2 underline" onClick={() => {
          setFile(null); setPreview(''); setItems([]); setMessage(''); setError(''); setConsent(false)
          scanRequest.current = null
          setAnalyzed(false)
          browse.current?.focus()
        }}>{translate('Remove photo')}</button>}

        <label className="mt-5 flex items-start gap-3 text-xs leading-6 text-[#795C69]">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />

          {translate("I agree to send this food image to Google's Gemini service for AI analysis. I understand that the estimates may be inaccurate.")}
        </label>

        <button
          type="button"
          onClick={scan}
          disabled={busy || !file || !consent || (!analyzed && plan?.remaining.scan === 0) || items.some(item => item.savePayload)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#7B2346] py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Camera size={18} />}
          {busy ? translate('Processing...') : translate('Analyze my meal')}
        </button>

        {message && (
          <p role="status" className="mt-4 text-xs text-[#977A86]">{translate(message)}</p>
        )}

        {analyzed && (
          <div className="mt-6 space-y-4">
            <h3 className="font-semibold text-[#7B2346]">
              {translate('Review AI Results')}
            </h3>

            <select
              aria-label={translate('Meal type')} disabled={busy || items.some(item => item.savePayload)} value={mealType}
              onChange={(e) => setMealType(e.target.value)}
              className="w-full rounded-xl border p-3"
            >
              {[
                'breakfast', 'morning_snack', 'lunch',
                'evening_snack', 'dinner'
              ].map((type) => (
                <option key={type} value={type}>
                  {optionLabel(type)}
                </option>
              ))}
            </select>

            {items.map((item, index) => (
              <div
                key={item.key}
                className="space-y-3 rounded-2xl bg-[#FFF6F1] p-4"
              >
                <p className="font-medium text-[#7B2346]">
                  {item.confidence
                    ? `${translate('AI identified')}: ${(language === 'ta' && foods.find(food => food.id === Number(item.food_id))?.name_ta) || item.name}`
                    : translate('Catalog food')}
                </p>

                <p className="text-xs text-[#977A86]">
                  {item.confidence === 'low' ? translate('Low confidence. Confirm this food before saving.') : item.confidence ? `${translate('Confidence')}: ${optionLabel(item.confidence)}` : translate('Added manually.')}
                </p>

                <select
                  aria-label={translate('Catalog food')} disabled={busy || Boolean(item.savePayload)} value={item.food_id}
                  onChange={(e) =>
                    edit(index, 'food_id', e.target.value)
                  }
                  className="w-full rounded-xl border p-3 text-sm"
                >
                  <option value="">{translate('Match with food catalog')}</option>
                  {foods.map((food) => (
                    <option key={food.id} value={food.id}>
                      {language === 'ta' ? food.name_ta || food.name_en : food.name_en}
                    </option>
                  ))}
                </select>

                <input
                  aria-label={translate('Portion in grams')} disabled={busy || Boolean(item.savePayload)}
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
                  {translate('Estimated portion in grams — please correct it.')}
                </p>
                <p className="text-sm font-medium">{translate('Per-item nutrition')}</p>
                {nutritionList([item])}
                {item.saved ? <p role="status">{translate('Saved to Food Diary')}</p> :
                  <button type="button" disabled={busy || Boolean(item.savePayload)} className="underline" onClick={() => setItems(previous => previous.filter(row => row.key !== item.key))}>{translate('Remove item')}</button>}
              </div>
            ))}
            <button type="button" disabled={busy} className="rounded-xl border px-4 py-2" onClick={() => setItems(previous => [...previous, {
              key: crypto.randomUUID(), name: 'Catalog food', estimated_grams: 100, food_id: '',
            }])}>{translate('Add food')}</button>

            {items.length > 0 && <section className="rounded-2xl border border-[#F6D3DB] p-4">
              <h3 className="font-semibold text-[#7B2346]">{translate('Estimated meal nutrition')}</h3>
              {nutritionList(items)}
            </section>}
            <button
              type="button"
              onClick={save}
              disabled={busy || !items.length}
              className="w-full rounded-full bg-[#7B2346] py-3 font-semibold text-white disabled:opacity-50"
            >
              {translate('Confirm and Save Meal')}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">{translate(error)}</p>
        )}
      </div>
    </dialog>
  )
}