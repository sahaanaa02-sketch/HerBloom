import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import AdminTable, { AdminStatusChip } from './AdminTable'
import { AdminMediaImage, ImagePicker } from './AdminMediaPicker'
import PairedStepsEditor from './PairedStepsEditor'
import {
  archiveAdminExercise, getAdminExercise, getAdminExercises, saveAdminExercise, submitAdminExercise,
} from '../../services/adminApi'

const categories = {
  pelvic_floor: 'Pelvic floor', breathing: 'Breathing', gentle_core: 'Gentle core',
  posture_back: 'Posture / back', stretching: 'Stretching', walking: 'Walking',
}
const statuses = { draft: 'Draft', in_review: 'In Review', archived: 'Archived', legacy: 'Legacy', published: 'Published' }
const options = (values) => Object.entries(values).map(([value, label]) => ({ value, label }))
const categoryLabel = (value) => categories[value] ?? value
const columns = [
  { field: 'name', headerName: 'English name', minWidth: 180, flex: 1 },
  { field: 'name_ta', headerName: 'Tamil name', minWidth: 150, flex: 1 },
  { field: 'category', headerName: 'Category', minWidth: 150, valueFormatter: categoryLabel },
  { field: 'duration_minutes', headerName: 'Minutes', minWidth: 90 },
  { field: 'status', headerName: 'Status', minWidth: 115, renderCell: ({ value }) => <AdminStatusChip status={value} /> },
]
const textClass = 'mt-1 w-full rounded-lg border border-[#F6D3DB] bg-white px-3 py-2 text-[#3A1224]'
const fields = [
  ['name', 'Name', 150], ['safety_notes', 'Safety notes', 15000],
  ['contraindications', 'Contraindications', 15000],
]
const empty = {
  name: '', name_ta: '', category: 'breathing', level: 'Gentle', duration_minutes: 3, repetitions: '',
  equipment: '', min_week: 0, delivery: 'both', needs_clearance: true, is_premium: false,
  safety_notes: '', safety_notes_ta: '', contraindications: '', contraindications_ta: '',
  image_media_id: null, video_url: '', steps: [],
}
const editableDraft = (row) => row.status === 'draft'

function toForm(record) {
  if (!record) return empty
  const form = Object.fromEntries(Object.keys(empty).map((field) => [field, record[field] ?? empty[field]]))
  const en = record.steps ?? []
  const ta = record.steps_ta ?? []
  form.steps = Array.from({ length: Math.max(en.length, ta.length) }, (_, index) => ({
    key: index, en: en[index] ?? '', ta: ta[index] ?? '',
  }))
  const delivery = record.allowed_delivery_types ?? []
  form.delivery = delivery.length > 1 ? 'both' : delivery[0] === 'c_section' ? 'csection' : delivery[0] ?? ''
  return form
}

function toPayload(form, initial) {
  const { delivery, steps, ...payload } = form
  payload.allowed_delivery_types = delivery === 'both' ? ['vaginal', 'csection'] : [delivery]
  payload.steps = steps.map((step) => step.en)
  payload.steps_ta = steps.map((step) => step.ta)
  payload.duration_minutes = Number(form.duration_minutes)
  payload.min_week = Number(form.min_week)
  payload.repetitions = form.repetitions === '' ? null : Number(form.repetitions)
  if (form.image_media_id === initial.image_media_id) delete payload.image_media_id
  return payload
}

function youtubeId(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    const parts = url.pathname.split('/').filter(Boolean)
    let id
    if (url.hostname === 'youtu.be' && parts.length === 1) id = parts[0]
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      const ids = url.searchParams.getAll('v')
      if (url.pathname === '/watch' && ids.length === 1) id = ids[0]
      if (parts.length === 2 && ['embed', 'shorts'].includes(parts[0])) id = parts[1]
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id ?? '') ? id : null
  } catch {
    return null
  }
}

function VideoPreview({ value }) {
  if (!value) return null
  const id = youtubeId(value)
  if (!id) return <p className="text-sm text-[#7B2346]">A valid HTTPS YouTube link is required for a thumbnail.</p>
  return (
    <a className="inline-block text-sm font-semibold text-[#7B2346]" target="_blank" rel="noreferrer"
      href={'https://www.youtube.com/watch?v=' + id}>
      <img className="mb-1 max-h-40 rounded-lg" src={'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'}
        alt="YouTube video thumbnail" referrerPolicy="no-referrer" />
      Open video on YouTube
    </a>
  )
}

function ExercisePreview({ form, token, legacyUrl }) {
  const [language, setLanguage] = useState('en')
  const suffix = language === 'ta' ? '_ta' : ''
  const text = (key) => form[key + suffix]
  const deliveryLabel = { both: 'Vaginal and C-section', vaginal: 'Vaginal', csection: 'C-section' }
  return (
    <article className="space-y-4 rounded-xl bg-[#FFF6F1] p-5 text-[#3A1224]">
      <div className="flex gap-2" aria-label="Preview language">
        <Button aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</Button>
        <Button aria-pressed={language === 'ta'} onClick={() => setLanguage('ta')}>Tamil</Button>
      </div>
      <div className="space-y-3" lang={language}>
        <h3 className="text-2xl font-bold">{text('name') || 'Name missing'}</h3>
        <p>{categoryLabel(form.category)} · {form.level} · {form.duration_minutes} min
          {form.repetitions !== '' && ' · ' + form.repetitions + ' repetitions'}</p>
        <p>From week {form.min_week} · {deliveryLabel[form.delivery] || 'Delivery type missing'}</p>
        {form.equipment && <p>Equipment: {form.equipment}</p>}
        {form.needs_clearance && <p>Professional clearance required</p>}
        <AdminMediaImage key={form.image_media_id} token={token} mediaId={form.image_media_id} legacyUrl={legacyUrl} />
        <VideoPreview value={form.video_url} />
        <ol className="list-decimal space-y-3 pl-5">
          {form.steps.map((step) => (
            <li key={step.key} className="rounded-xl bg-white px-4 py-3">{step[language] || 'Translation missing'}</li>
          ))}
        </ol>
        <p className="whitespace-pre-line rounded-lg bg-white p-3"><strong>Safety notes</strong><br />{text('safety_notes') || 'Missing'}</p>
        <p className="whitespace-pre-line rounded-lg bg-white p-3"><strong>Contraindications</strong><br />{text('contraindications') || 'Missing'}</p>
      </div>
    </article>
  )
}

function ExerciseDialog({ detail, token, permissions, onClose, onSaved }) {
  const { record, mode } = detail
  const [initial] = useState(() => toForm(record))
  const [form, setForm] = useState(initial)
  const [preview, setPreview] = useState(mode === 'view')
  const [picker, setPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const dirty = mode === 'edit' && JSON.stringify(form) !== JSON.stringify(initial)
  const canSubmit = record?.status === 'draft' && permissions.includes('content.edit')
  const canArchive = ['draft', 'in_review'].includes(record?.status) && permissions.includes('content.delete')
  const missingTamil = fields.some(([field]) => !form[field + '_ta'].trim())
    || !form.steps.length || form.steps.some((step) => !step.ta.trim())

  useEffect(() => {
    if (!dirty) return
    function warn(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function close() {
    if (!pending.current && (!dirty || window.confirm('Discard your unsaved exercise changes?'))) onClose()
  }
  const change = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  async function mutate(operation) {
    if (pending.current) return
    pending.current = true
    setSaving(true)
    setError('')
    try {
      await operation()
      onSaved()
    } catch (reason) {
      setError(reason.message)
      setSaving(false)
    } finally {
      pending.current = false
    }
  }
  function save(event) {
    event.preventDefault()
    if (mode === 'edit' && !preview) mutate(() => saveAdminExercise(token, record?.id, toPayload(form, initial)))
  }
  function archive() {
    if (!dirty && !pending.current && window.confirm('Archive this exercise? It will become read-only.')) {
      mutate(() => archiveAdminExercise(token, record.id))
    }
  }

  return (
    <Dialog open onClose={close} fullWidth maxWidth="md">
      <form onSubmit={save}>
        <DialogTitle>{mode === 'view' ? 'Exercise preview' : record ? 'Edit exercise draft' : 'New exercise draft'}</DialogTitle>
        <DialogContent dividers>
          <div className="space-y-3">
            {error && <Alert severity="error">{error}</Alert>}
            {record && <AdminStatusChip status={record.status} />}
            {preview ? (
              <ExercisePreview form={form} token={token} legacyUrl={record?.image_url} />
            ) : (
              <fieldset disabled={saving} className="space-y-4 text-[#3A1224]">
                {missingTamil && <Alert severity="warning">Complete the Tamil name, steps, safety notes, and contraindications before submitting.</Alert>}
                {fields.map(([field, label, max]) => (
                  <div key={field} className="grid gap-3 sm:grid-cols-2">
                    {[['', 'English'], ['_ta', 'Tamil']].map(([suffix, language]) => {
                      const key = field + suffix
                      return (
                        <label key={key}>{label} · {language}
                          {field === 'name'
                            ? <input required={!suffix} maxLength={max} className={textClass} value={form[key]} onChange={(event) => change(key, event.target.value)} />
                            : <textarea rows={3} maxLength={max} className={textClass} value={form[key]} onChange={(event) => change(key, event.target.value)} />}
                        </label>
                      )
                    })}
                  </div>
                ))}
                <PairedStepsEditor title="Exercise steps" steps={form.steps} onChange={(steps) => change('steps', steps)} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>Category
                    <select className={textClass} value={form.category} onChange={(event) => change('category', event.target.value)}>
                      {options(categories).map(({value,label}) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>Allowed deliveries
                    <select className={textClass} value={form.delivery} onChange={(event) => change('delivery', event.target.value)}>
                      <option value="both">Both</option><option value="vaginal">Vaginal</option><option value="csection">C-section</option>
                    </select>
                  </label>
                  {[['level','Difficulty level',30],['equipment','Equipment',200]].map(([key,label,maxLength]) => (
                    <label key={key}>{label}
                      <input className={textClass} required={key === 'level'} maxLength={maxLength} value={form[key]} onChange={(event) => change(key,event.target.value)} />
                    </label>
                  ))}
                  {[
                    ['duration_minutes','Duration (minutes)',1,1440], ['repetitions','Repetitions',1,10000], ['min_week','Minimum postpartum week',0,520],
                  ].map(([key,label,min,max]) => (
                    <label key={key}>{label}
                      <input className={textClass} type="number" min={min} max={max} required={key !== 'repetitions'} value={form[key]} onChange={(event) => change(key,event.target.value)} />
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4">
                  {[['needs_clearance','Professional clearance required'],['is_premium','Premium metadata']].map(([key,label]) => (
                    <label key={key} className="flex items-center gap-2">
                      <input type="checkbox" checked={form[key]} onChange={(event) => change(key,event.target.checked)} />{label}
                    </label>
                  ))}
                </div>
                {permissions.includes('media.view') && (
                  <div>
                    <Button onClick={() => setPicker((value) => !value)}>Choose library image</Button>
                    {form.image_media_id && <Button onClick={() => change('image_media_id', null)}>Remove selected image</Button>}
                    {form.image_media_id && <AdminMediaImage key={form.image_media_id} token={token} mediaId={form.image_media_id} />}
                    {picker && <ImagePicker token={token} onSelect={(id) => { change('image_media_id', id); setPicker(false) }} />}
                  </div>
                )}
                <label className="block">HTTPS YouTube link
                  <input className={textClass} type="url" maxLength={500} value={form.video_url} onChange={(event) => change('video_url', event.target.value)} />
                </label>
                <VideoPreview value={form.video_url} />
              </fieldset>
            )}
          </div>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap' }}>
          <Button disabled={saving} onClick={close}>Close</Button>
          {canArchive && <Button disabled={saving || dirty} onClick={archive}>Archive</Button>}
          {canSubmit && <Button disabled={saving || dirty} onClick={() => mutate(() => submitAdminExercise(token, record.id))}>Submit for Review</Button>}
          {mode === 'edit' && <Button disabled={saving} onClick={() => setPreview((value) => !value)}>{preview ? 'Back to editor' : 'Preview'}</Button>}
          {mode === 'edit' && !preview && <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</Button>}
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default function ExerciseManager({ token, permissions }) {
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
  const query = useMemo(
    () => ({ params: { page: page + 1, page_size: pageSize, search, ...selection }, revision }),
    [page, pageSize, search, selection, revision],
  )
  const current = list?.query === query ? list : null
  const categoryOptions = Object.fromEntries((list?.data?.categories ?? []).map((value) => [value, categoryLabel(value)]))

  useEffect(() => {
    if (!canRead) return
    let active = true
    getAdminExercises(token, query.params)
      .then((data) => { if (active) setList({ query, data }) })
      .catch((reason) => { if (active) setList({ query, error: reason.message }) })
    return () => { active = false }
  }, [canRead, query, token])

  async function open(row, mode) {
    if (opening) return
    setOpening(true)
    setError('')
    try {
      const record = await getAdminExercise(token, row.id)
      setDetail({ record, mode: editableDraft(record) ? mode : 'view' })
    } catch (reason) {
      setError(reason.message)
    } finally {
      setOpening(false)
    }
  }

  if (!canRead) return <Alert severity="warning">Exercise viewing permission is required.</Alert>
  return (
    <>
      {(error || current?.error) && <Alert severity="error">{error || current.error}</Alert>}
      <AdminTable title="Exercises" columns={columns} rows={current?.data?.items ?? []}
        total={list?.data?.total ?? 0} loading={!current || opening} page={page} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={(size) => { setPage(0); setPageSize(size) }}
        onSearchChange={onSearch} onFilterChange={(values) => { setPage(0); setSelection(values) }}
        filters={[
          { key: 'category', label: 'Category', options: options(categoryOptions) },
          { key: 'status', label: 'Status', options: options(statuses) },
          { key: 'tamil', label: 'Tamil', options: options({ missing: 'Tamil missing', complete: 'Tamil complete' }) },
        ]}
        onRefresh={() => setRevision((value) => value + 1)}
        onCreate={() => setDetail({ mode: 'edit' })}
        onView={(row) => open(row, 'view')} onEdit={(row) => open(row, 'edit')}
        canCreate={permissions.includes('content.create')} canEdit={permissions.includes('content.edit')}
        canEditRow={editableDraft} createLabel="New exercise draft"
      />
      {detail && <ExerciseDialog detail={detail} token={token} permissions={permissions}
        onClose={() => setDetail(null)}
        onSaved={() => { setDetail(null); setRevision((value) => value + 1) }} />}
    </>
  )
}
