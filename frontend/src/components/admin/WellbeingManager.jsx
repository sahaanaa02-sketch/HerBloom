import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import AdminTable, { AdminStatusChip } from './AdminTable'
import { MediaPicker } from './AdminMediaPicker'
import PairedStepsEditor from './PairedStepsEditor'
import {
  archiveAdminActivity, getAdminActivity, getAdminActivities, getAdminMediaFile,
  saveAdminActivity, submitAdminActivity,
} from '../../services/adminApi'

const types = { meditation: 'Meditation', breathing: 'Breathing', sleep: 'Sleep', gratitude: 'Gratitude' }
const statuses = { draft: 'Draft', in_review: 'In Review', archived: 'Archived', legacy: 'Legacy', published: 'Published' }
const options = (map) => Object.entries(map).map(([value, label]) => ({ value, label }))
const filters = [
  { key: 'activity_type', label: 'Activity type', options: options(types) },
  { key: 'status', label: 'Status', options: options(statuses) },
  { key: 'tamil', label: 'Tamil', options: options({ missing: 'Tamil missing', complete: 'Tamil complete' }) },
]
const columns = [
  { field: 'title', headerName: 'English title', minWidth: 180, flex: 1 },
  { field: 'title_ta', headerName: 'Tamil title', minWidth: 150, flex: 1 },
  { field: 'activity_type', headerName: 'Type', minWidth: 130, valueFormatter: (value) => types[value] ?? value },
  { field: 'duration_minutes', headerName: 'Minutes', minWidth: 90 },
  { field: 'status', headerName: 'Status', minWidth: 115, renderCell: ({ value }) => <AdminStatusChip status={value} /> },
]
const control = 'mt-1 w-full rounded-lg border border-[#F6D3DB] bg-white px-3 py-2 text-[#3A1224]'
const empty = { title: '', title_ta: '', activity_type: 'breathing', duration_minutes: 2, steps: [], audio_media_id: null, is_premium: false }
const isDraft = (row) => row.status === 'draft'

function AudioPreview({ token, id }) {
  const [source, setSource] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let url
    getAdminMediaFile(token, id, 'audio/*').then((blob) => {
      if (!active) return
      url = URL.createObjectURL(blob)
      setSource(url)
    }).catch(() => { if (active) setError('Audio is unavailable.') })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [token, id])
  if (error) return <Alert severity="warning">{error}</Alert>
  return source ? <audio controls src={source} aria-label="Activity audio preview" /> : <p role="status">Loading audio…</p>
}

function ActivityPreview({ form, token }) {
  const [language, setLanguage] = useState('en')
  return (
    <article className="space-y-4 rounded-xl bg-[#FFF6F1] p-5 text-[#3A1224]">
      <div className="flex gap-2" aria-label="Preview language">
        <Button aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</Button>
        <Button aria-pressed={language === 'ta'} onClick={() => setLanguage('ta')}>Tamil</Button>
      </div>
      <section className="space-y-3" lang={language}>
        <h3 className="text-2xl font-bold">{(language === 'en' ? form.title : form.title_ta) || 'Title missing'}</h3>
        <p>{types[form.activity_type] ?? form.activity_type} · {form.duration_minutes} min</p>
        {form.audio_media_id && <AudioPreview key={form.audio_media_id} token={token} id={form.audio_media_id} />}
        <ol className="list-decimal space-y-2 pl-5">
          {form.steps.map((pair) => <li key={pair.key}>{pair[language] || 'Translation missing'}</li>)}
        </ol>
      </section>
    </article>
  )
}

function formFrom(record) {
  if (!record) return empty
  const values = Object.fromEntries(Object.keys(empty).map((name) => [name, record[name] ?? empty[name]]))
  const en = Array.isArray(record.steps) ? record.steps : []
  const ta = Array.isArray(record.steps_ta) ? record.steps_ta : []
  values.steps = Array.from({ length: Math.max(en.length, ta.length) }, (_, key) => ({
    key, en: en[key] ?? '', ta: ta[key] ?? '',
  }))
  return values
}

function ActivityDialog({ detail, token, permissions, onClose, onSaved }) {
  const { record, mode } = detail
  const [initial] = useState(() => formFrom(record))
  const [form, setForm] = useState(initial)
  const [preview, setPreview] = useState(mode === 'view')
  const [picker, setPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const dirty = mode === 'edit' && JSON.stringify(form) !== JSON.stringify(initial)
  const canSubmit = record?.status === 'draft' && permissions.includes('content.edit')
  const canArchive = ['draft', 'in_review'].includes(record?.status) && permissions.includes('content.delete')
  const missingTamil = !form.title_ta.trim() || !form.steps.length || form.steps.some((step) => !step.ta.trim())

  useEffect(() => {
    if (!dirty) return
    function warn(event) { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function close() {
    if (!busy.current && (!dirty || window.confirm('Discard your unsaved activity changes?'))) onClose()
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

  function save(event) {
    event.preventDefault()
    if (mode !== 'edit' || preview) return
    const payload = {
      ...form, duration_minutes: Number(form.duration_minutes),
      steps: form.steps.map((step) => step.en), steps_ta: form.steps.map((step) => step.ta),
    }
    if (form.audio_media_id === initial.audio_media_id) delete payload.audio_media_id
    mutate(() => saveAdminActivity(token, record?.id, payload))
  }

  function archive() {
    if (!dirty && !busy.current && window.confirm('Archive this activity? It will become read-only.')) {
      mutate(() => archiveAdminActivity(token, record.id))
    }
  }

  return (
    <Dialog open onClose={close} fullWidth maxWidth="md">
      <form onSubmit={save}>
        <DialogTitle>{mode === 'view' ? 'Activity preview' : record ? 'Edit activity draft' : 'New activity draft'}</DialogTitle>
        <DialogContent dividers>
          <div className="space-y-3">
            {error && <Alert severity="error">{error}</Alert>}
            {record && <AdminStatusChip status={record.status} />}
            {preview ? <ActivityPreview form={form} token={token} /> : (
              <fieldset disabled={saving} className="space-y-4 text-[#3A1224]">
                {missingTamil && <Alert severity="warning">Complete the Tamil title and steps before submitting.</Alert>}
                <div className="grid gap-3 sm:grid-cols-2">
                  {[['title', 'English title'], ['title_ta', 'Tamil title']].map(([field, label]) => (
                    <label key={field}>{label}
                      <input required={field === 'title'} maxLength={120} className={control}
                        value={form[field]} onChange={(event) => change(field, event.target.value)} />
                    </label>
                  ))}
                  <label>Activity type
                    <select className={control} value={form.activity_type} onChange={(event) => change('activity_type', event.target.value)}>
                      {options(types).map(({value,label}) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>Duration (minutes)
                    <input className={control} type="number" min={1} max={1440} required value={form.duration_minutes}
                      onChange={(event) => change('duration_minutes', event.target.value)} />
                  </label>
                </div>
                <PairedStepsEditor title="Activity steps" steps={form.steps} onChange={(steps) => change('steps', steps)} />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.is_premium} onChange={(event) => change('is_premium', event.target.checked)} />Premium metadata
                </label>
                {permissions.includes('media.view') && (
                  <div>
                    <Button onClick={() => setPicker((value) => !value)}>Choose library audio</Button>
                    {form.audio_media_id && <Button onClick={() => change('audio_media_id', null)}>Remove selected audio</Button>}
                    {form.audio_media_id && <AudioPreview key={form.audio_media_id} token={token} id={form.audio_media_id} />}
                    {picker && <MediaPicker mediaType="audio" token={token} onSelect={(id) => { change('audio_media_id', id); setPicker(false) }} />}
                  </div>
                )}
              </fieldset>
            )}
          </div>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap' }}>
          <Button disabled={saving} onClick={close}>Close</Button>
          {canArchive && <Button disabled={saving || dirty} onClick={archive}>Archive</Button>}
          {canSubmit && <Button disabled={saving || dirty} onClick={() => mutate(() => submitAdminActivity(token, record.id))}>Submit for Review</Button>}
          {mode === 'edit' && <Button disabled={saving} onClick={() => setPreview((value) => !value)}>{preview ? 'Back to editor' : 'Preview'}</Button>}
          {mode === 'edit' && !preview && <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</Button>}
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default function WellbeingManager({ token, permissions }) {
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
    getAdminActivities(token, query.params)
      .then((data) => { if (active) setList({ query, data }) })
      .catch((reason) => { if (active) setList({ query, error: reason.message }) })
    return () => { active = false }
  }, [canRead, query, token])

  async function open(row, mode) {
    if (opening) return
    setOpening(true)
    setError('')
    try {
      const record = await getAdminActivity(token, row.id)
      setDetail({ record, mode: isDraft(record) ? mode : 'view' })
    } catch (reason) {
      setError(reason.message)
    } finally {
      setOpening(false)
    }
  }

  if (!canRead) return <Alert severity="warning">Activity viewing permission is required.</Alert>
  return (
    <>
      {(error || current?.error) && <Alert severity="error">{error || current.error}</Alert>}
      <AdminTable title="Wellbeing Activities" columns={columns} rows={current?.data?.items ?? []}
        total={list?.data?.total ?? 0} loading={!current || opening} page={page} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={(size) => { setPage(0); setPageSize(size) }}
        onSearchChange={onSearch} onFilterChange={(values) => { setPage(0); setSelection(values) }}
        filters={filters} onRefresh={() => setRevision((value) => value + 1)}
        onCreate={() => setDetail({ mode: 'edit' })} onView={(row) => open(row, 'view')} onEdit={(row) => open(row, 'edit')}
        canCreate={!current?.error && permissions.includes('content.create')}
        canEdit={permissions.includes('content.edit')} canEditRow={isDraft} createLabel="New activity draft"
      />
      {detail && <ActivityDialog detail={detail} token={token} permissions={permissions}
        onClose={() => setDetail(null)} onSaved={() => { setDetail(null); setRevision((value) => value + 1) }} />}
    </>
  )
}
