import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import AdminTable, { AdminStatusChip } from './AdminTable'
import { AdminMediaImage, ImagePicker } from './AdminMediaPicker'
import {
  archiveAdminMeal, getAdminMeal, getAdminMeals, previewAdminMealNutrients,
  saveAdminMeal, searchAdminMealFoods, submitAdminMeal,
} from '../../services/adminApi'

const slots = {
  breakfast: 'Breakfast', morning_snack: 'Morning snack', lunch: 'Lunch',
  evening_snack: 'Evening snack', dinner: 'Dinner',
}
const tagLabels = { iron_rich: 'Iron-rich', low_gi: 'Low GI', vegetarian: 'Vegetarian', vegan: 'Vegan', pescatarian: 'Pescatarian' }
const statuses = { draft: 'Draft', in_review: 'In Review', archived: 'Archived', legacy: 'Legacy', published: 'Published' }
const options = (map) => Object.entries(map).map(([value, label]) => ({ value, label }))
const filters = [
  { key: 'status', label: 'Status', options: options(statuses) },
  { key: 'tamil', label: 'Tamil', options: options({ missing: 'Tamil missing', complete: 'Tamil complete' }) },
]
const columns = [
  { field: 'title', headerName: 'English title', minWidth: 180, flex: 1 },
  { field: 'title_ta', headerName: 'Tamil title', minWidth: 150, flex: 1 },
  { field: 'category', headerName: 'Meal slot', minWidth: 130, valueFormatter: (value) => slots[value] ?? value },
  { field: 'status', headerName: 'Status', minWidth: 115, renderCell: ({ value }) => <AdminStatusChip status={value} /> },
]
const control = 'mt-1 w-full rounded-lg border border-[#F6D3DB] bg-white px-3 py-2 text-[#3A1224]'
const empty = { title: '', title_ta: '', description: '', description_ta: '', category: 'lunch', tags: [], allergens: '', ingredients: [], photo_media_id: null }
const isDraft = (row) => row.status === 'draft'

function MealPreview({ form, token, totals, legacyIngredients }) {
  const [language, setLanguage] = useState('en')
  return (
    <article className="space-y-4 rounded-xl bg-[#FFF6F1] p-5 text-[#3A1224]">
      <div className="flex gap-2" aria-label="Preview language">
        <Button aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</Button>
        <Button aria-pressed={language === 'ta'} onClick={() => setLanguage('ta')}>Tamil</Button>
      </div>
      <section className="space-y-3" lang={language}>
        <AdminMediaImage key={form.photo_media_id} token={token} mediaId={form.photo_media_id} />
        <p className="text-xs font-semibold">{slots[form.category] ?? form.category}</p>
        <h3 className="text-2xl font-bold">{(language === 'en' ? form.title : form.title_ta) || 'Title missing'}</h3>
        <p className="whitespace-pre-wrap">{language === 'en' ? form.description : form.description_ta}</p>
        <ul className="list-disc space-y-2 pl-5">
          {form.ingredients.map((food) => <li key={food.food_id}>{language === 'ta' ? food.name_ta || food.name_en : food.name_en} ({food.grams || '-'} g)</li>)}
          {!form.ingredients.length && legacyIngredients?.filter((entry) => typeof entry === 'string').map((entry, index) => <li key={index}>{entry}</li>)}
        </ul>
        <div className="flex flex-wrap gap-2">
          {form.tags.map((tag, index) => <span key={index} className="rounded-full bg-white px-3 py-1 text-xs">{tagLabels[tag] ?? tag}</span>)}
        </div>
        {form.allergens && <p className="text-sm"><strong>Allergens</strong> {form.allergens.split('\n').filter(Boolean).join(', ')}</p>}
        <Totals result={totals} />
      </section>
    </article>
  )
}

function Totals({ result }) {
  if (!result) return null
  if (!result.totals) {
    return <p className="text-sm">{result.unverified_food_ids.length
      ? 'Totals are unavailable because one or more foods have unverified nutrition data.'
      : 'Add catalog ingredients to calculate totals.'}</p>
  }
  const { calories, protein, iron, calcium } = result.totals
  return <p className="rounded-lg bg-white p-3 text-sm" role="status">
    Total for entered quantities: {calories} kcal, {protein} g protein, {iron} mg iron, {calcium} mg calcium
  </p>
}

function IngredientPicker({ token, items, onChange }) {
  const [search, setSearch] = useState('')
  const [result, setResult] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pending = useRef(0)

  async function find() {
    const request = ++pending.current
    setLoading(true)
    setError('')
    try {
      const data = await searchAdminMealFoods(token, search)
      if (request === pending.current) setResult(data)
    } catch (reason) {
      if (request === pending.current) setError(reason.message)
    } finally {
      if (request === pending.current) setLoading(false)
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-[#F6D3DB] p-3">
      <h3 className="font-semibold">Ingredients</h3>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-40 flex-1">Search the food catalog
          <input className={control} maxLength={150} value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <Button type="button" disabled={loading} onClick={find}>Find foods</Button>
      </div>
      {error && <Alert severity="error">{error}</Alert>}
      {result.length > 0 && <ul className="max-h-48 overflow-auto rounded-lg bg-[#FFF6F1] p-2">
        {result.map((food) => <li key={food.id}>
          <Button disabled={items.length >= 50 || items.some((item) => item.food_id === food.id)}
            onClick={() => onChange([...items, { ...food, food_id: food.id, grams: '' }])}>{food.name_en}{food.name_ta && ' / ' + food.name_ta}</Button>
        </li>)}
      </ul>}
      {items.map((food) => <div key={food.food_id} className="flex flex-wrap items-end justify-between gap-2">
        <label>{food.name_en} (grams)
          <input type="number" required min={0.01} step={0.01} max={99999999.99} className={control} value={food.grams}
            onChange={(event) => onChange(items.map((item) => item.food_id === food.food_id ? { ...item, grams: event.target.value } : item))} />
        </label>
        <Button aria-label={'Remove ' + food.name_en} onClick={() => onChange(items.filter((item) => item.food_id !== food.food_id))}>Remove</Button>
      </div>)}
    </section>
  )
}

function formFrom(record) {
  if (!record) return empty
  const values = Object.fromEntries(Object.keys(empty).map((name) => [name, record[name] ?? empty[name]]))
  values.ingredients = record.food_ingredients ?? []
  values.allergens = (record.allergens ?? []).join('\n')
  return values
}

function MealDialog({ detail, token, permissions, onClose, onSaved }) {
  const { record, mode } = detail
  const [initial] = useState(() => formFrom(record))
  const [form, setForm] = useState(initial)
  const [preview, setPreview] = useState(mode === 'view')
  const [picker, setPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [totals, setTotals] = useState(record ? { totals: record.totals, unverified_food_ids: record.unverified_food_ids } : null)
  const [calculating, setCalculating] = useState(false)
  const busy = useRef(false)
  const dirty = mode === 'edit' && JSON.stringify(form) !== JSON.stringify(initial)
  const canSubmit = record?.status === 'draft' && permissions.includes('content.edit')
  const canArchive = ['draft', 'in_review'].includes(record?.status) && permissions.includes('content.delete')
  const missingTamil = !form.title_ta.trim() || (form.description.trim() && !form.description_ta.trim())

  useEffect(() => {
    if (!dirty) return
    function warn(event) { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function close() {
    if (!busy.current && (!dirty || window.confirm('Discard your unsaved meal idea changes?'))) onClose()
  }

  const change = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  async function mutate(operation) {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    setError('')
    try {
      await operation()
      onSaved()
    } catch (reason) {
      setError(reason.message)
      setSaving(false)
    } finally {
      busy.current = false
    }
  }

  const ingredients = () => form.ingredients.map(({ food_id, grams }) => ({ food_id, grams }))

  async function calculateTotals() {
    setCalculating(true)
    setError('')
    try {
      setTotals(await previewAdminMealNutrients(token, ingredients()))
    } catch (reason) {
      setTotals(null)
      setError(reason.message)
    } finally {
      setCalculating(false)
    }
  }

  function save(event) {
    event.preventDefault()
    if (mode !== 'edit' || preview) return
    const payload = { ...form, ingredients: ingredients(), allergens: form.allergens.split('\n').map((line) => line.trim()).filter(Boolean) }
    if (form.photo_media_id === initial.photo_media_id) delete payload.photo_media_id
    mutate(() => saveAdminMeal(token, record?.id, payload))
  }

  function archive() {
    if (!dirty && !busy.current && window.confirm('Archive this meal idea? It will become read-only.')) {
      mutate(() => archiveAdminMeal(token, record.id))
    }
  }

  return (
    <Dialog open onClose={close} fullWidth maxWidth="md">
      <form onSubmit={save}>
        <DialogTitle>{mode === 'view' ? 'Meal idea preview' : record ? 'Edit meal idea draft' : 'New meal idea draft'}</DialogTitle>
        <DialogContent dividers>
          <div className="space-y-3">
            {error && <Alert severity="error">{error}</Alert>}
            {record && <AdminStatusChip status={record.status} />}
            {preview ? <MealPreview form={form} token={token} totals={totals} legacyIngredients={record?.ingredients} /> : (
              <fieldset disabled={saving || calculating} className="space-y-4 text-[#3A1224]">
                {missingTamil && <Alert severity="warning">Complete the Tamil title and any preparation translation before submitting.</Alert>}
                <div className="grid gap-3 sm:grid-cols-2">
                  {[['title', 'English title'], ['title_ta', 'Tamil title']].map(([field, label]) => (
                    <label key={field}>{label}
                      <input required={field === 'title'} maxLength={150} className={control}
                        value={form[field]} onChange={(event) => change(field, event.target.value)} />
                    </label>
                  ))}
                  {[['description', 'Preparation (English)'], ['description_ta', 'Preparation (Tamil)']].map(([field, label]) => (
                    <label key={field}>{label}
                      <textarea rows={4} maxLength={15000} className={control} value={form[field]}
                        onChange={(event) => change(field, event.target.value)} />
                    </label>
                  ))}
                  <label>Meal slot
                    <select className={control} value={form.category} onChange={(event) => change('category', event.target.value)}>
                      {options(slots).map(({value,label}) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>Allergens (one per line)
                    <textarea rows={2} maxLength={5049} className={control} value={form.allergens}
                      onChange={(event) => change('allergens', event.target.value)} />
                  </label>
                </div>
                <fieldset className="flex flex-wrap gap-4">
                  <legend className="font-semibold">Dietary tags</legend>
                  {options(tagLabels).map(({value,label}) => (
                    <label key={value} className="flex items-center gap-2">
                      <input type="checkbox" checked={form.tags.includes(value)} onChange={(event) => {
                        change('tags',event.target.checked ? [...form.tags,value] : form.tags.filter((tag) => tag !== value))
                      }} />{label}
                    </label>
                  ))}
                </fieldset>
                <IngredientPicker token={token} items={form.ingredients} onChange={(ingredients) => {
                  change('ingredients', ingredients)
                  setTotals(null)
                }} />
                <Button disabled={calculating || !form.ingredients.length}
                  onClick={calculateTotals}>Calculate nutrient totals</Button>
                <Totals result={totals} />
                {permissions.includes('media.view') && (
                  <div>
                    <Button onClick={() => setPicker((value) => !value)}>Choose library photo</Button>
                    {form.photo_media_id && <Button onClick={() => change('photo_media_id', null)}>Remove selected photo</Button>}
                    {form.photo_media_id && <AdminMediaImage key={form.photo_media_id} token={token} mediaId={form.photo_media_id} />}
                    {picker && <ImagePicker token={token} onSelect={(id) => { change('photo_media_id', id); setPicker(false) }} />}
                  </div>
                )}
              </fieldset>
            )}
          </div>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap' }}>
          <Button disabled={saving} onClick={close}>Close</Button>
          {canArchive && <Button disabled={saving || dirty} onClick={archive}>Archive</Button>}
          {canSubmit && <Button disabled={saving || dirty} onClick={() => mutate(() => submitAdminMeal(token, record.id))}>Submit for Review</Button>}
          {mode === 'edit' && <Button disabled={saving} onClick={() => setPreview((value) => !value)}>{preview ? 'Back to editor' : 'Preview'}</Button>}
          {mode === 'edit' && !preview && <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</Button>}
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default function MealIdeasManager({ token, permissions }) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState({})
  const [revision, setRevision] = useState(0)
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  const [opening, setOpening] = useState(false)
  const canRead = permissions.includes('content.view')
  const onSearch = useCallback((value) => { setPage(0); setSearch(value) }, [])
  const query = useMemo(() => ({ params: { page: page + 1, page_size: pageSize, search, ...selection }, revision }),
    [page, pageSize, search, selection, revision])
  const current = list?.query === query ? list : null

  useEffect(() => {
    if (!canRead) return
    let active = true
    getAdminMeals(token, query.params)
      .then((data) => { if (active) setList({ query, data }) })
      .catch((reason) => { if (active) setList({ query, error: reason.message }) })
    return () => { active = false }
  }, [canRead, query, token])

  async function open(row, mode) {
    if (opening) return
    setOpening(true)
    setError('')
    try {
      const record = await getAdminMeal(token, row.id)
      setDetail({ record, mode: isDraft(record) ? mode : 'view' })
    } catch (reason) {
      setError(reason.message)
    } finally {
      setOpening(false)
    }
  }

  if (!canRead) return <Alert severity="warning">Meal idea viewing permission is required.</Alert>
  return (
    <>
      {(error || current?.error) && <Alert severity="error">{error || current.error}</Alert>}
      <AdminTable title="Meal Ideas" columns={columns} rows={current?.data?.items ?? []}
        total={list?.data?.total ?? 0} loading={!current || opening} page={page} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={(size) => { setPage(0); setPageSize(size) }}
        onSearchChange={onSearch} onFilterChange={(values) => { setPage(0); setSelection(values) }}
        filters={[{
          key: 'category', label: 'Meal slot',
          options: options({ ...Object.fromEntries((list?.data?.categories ?? []).map((key) => [key,key])), ...slots }),
        }, ...filters]} onRefresh={() => setRevision((value) => value + 1)}
        onCreate={() => setDetail({ mode: 'edit' })} onView={(row) => open(row, 'view')} onEdit={(row) => open(row, 'edit')}
        canCreate={!current?.error && permissions.includes('content.create')}
        canEdit={permissions.includes('content.edit')} canEditRow={isDraft} createLabel="New meal idea draft"
      />
      {detail && <MealDialog detail={detail} token={token} permissions={permissions}
        onClose={() => setDetail(null)} onSaved={() => { setDetail(null); setRevision((value) => value + 1) }} />}
    </>
  )
}
