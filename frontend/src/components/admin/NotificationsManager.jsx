import { useCallback, useEffect, useState } from 'react'
import AdminTable, { AdminStatusChip } from './AdminTable'
import { notificationsRequest } from '../../services/adminApi'

const resources = {
  announcements: ['Announcements', ['draft', 'scheduled', 'active', 'expired']],
  daily_tips: ['Daily tips', ['draft', 'in_review', 'published', 'archived']],
  reminder_templates: ['Reminder templates', ['draft', 'published']],
}
const keys = ['water', 'rest', 'mood', 'meals', 'recovery', 'medicine', 'appointment', 'gdm_test']
const audiences = ['week_min', 'week_max', 'delivery_type', 'language', 'plan']
const label = (value) => value.replaceAll('_', ' ').replace(/^./, (first) => first.toUpperCase())
const localTime = (value) => {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function Editor({ resource, record, token, canEdit, canPublish, canDelete, close, reload }) {
  const announcement = resource === 'announcements'
  const tip = resource === 'daily_tips'
  const editable = canEdit && (!record.id || record.status === 'draft')
  const [values, setValues] = useState(() => {
    const fieldNames = announcement
      ? [...audiences, 'title_en', 'title_ta', 'body_en', 'body_ta', 'channel', 'start_at', 'end_at']
      : [tip ? 'week' : 'key', 'text_en', 'text_ta']
    const fields = Object.fromEntries(fieldNames.map((name) => [name, record[name]]))
    if (announcement && record.id) {
      fields.start_at = localTime(fields.start_at)
      fields.end_at = localTime(fields.end_at)
    }
    return fields
  })
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [count, setCount] = useState(null)

  useEffect(() => {
    if (!dirty) return
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function update(name, value) {
    setValues((previous) => ({ ...previous, [name]: value }))
    setDirty(true)
    setCount(null)
  }

  function targeting() {
    return Object.fromEntries(audiences.map((key) => {
      const value = values[key]
      return [key, value === '' || value == null ? null : key.startsWith('week_') ? Number(value) : value]
    }))
  }

  async function run(action) {
    setBusy(true)
    setMessage('')
    try {
      const path = '/' + resource + (record.id ? '/' + record.id : '')
      if (action === 'preview') {
        const result = await notificationsRequest(token, '/announcements/audience-preview', 'POST', targeting())
        setCount(result.count)
        return
      }
      if (action === 'save') {
        const body = announcement ? {
          ...values, ...targeting(), channel: values.channel || 'banner',
          start_at: new Date(values.start_at).toISOString(), end_at: new Date(values.end_at).toISOString(),
        } : tip ? { ...values, week: Number(values.week) } : { ...values, key: values.key || 'water' }
        await notificationsRequest(token, path, record.id ? 'PUT' : 'POST', body)
      } else if (action === 'delete') {
        await notificationsRequest(token, path, 'DELETE')
      } else {
        await notificationsRequest(token, path + (tip ? '/editorial' : '/publication') + '?action=' + action, 'POST')
      }
      reload()
      close()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
      setConfirmation('')
    }
  }

  const field = (name, { text, choices, type = 'text', required = true, fallback = '' } = {}) => (
    <label key={name}>
      {label(name)}
      {choices ? <select disabled={!editable} value={values[name] ?? fallback}
        onChange={(event) => update(name, event.target.value)}>
        {choices.map((option) => <option key={option} value={option}>{option ? label(option) : 'Any'}</option>)}
      </select> : text ? <textarea readOnly={!editable} required={required} value={values[name] ?? ''}
        onChange={(event) => update(name, event.target.value)} rows={4} maxLength={5000} /> :
        <input readOnly={!editable} required={required} type={type} value={values[name] ?? ''}
          min={type === 'number' ? 0 : undefined} max={type === 'number' ? 65535 : undefined}
          maxLength={name === 'plan' ? 40 : 180} onChange={(event) => update(name, event.target.value)} />}
    </label>
  )
  const stage = record.lifecycle || record.status || 'draft'
  return (
    <section className="ha-panel space-y-4">
      <h2>{resources[resource][0]} · {label(stage)}</h2>
      {tip && record.reviewed_by && <p>Clinical reviewer #{record.reviewed_by} · {record.reviewed_at}</p>}
      {message && <p role="alert">{message}</p>}
      <form onSubmit={(event) => { event.preventDefault(); run('save') }}>
        <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2 [&_label]:grid [&_label]:gap-1 [&_input]:rounded-lg [&_input]:border [&_input]:p-2 [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:p-2 [&_select]:rounded-lg [&_select]:border [&_select]:p-2">
          {announcement && ['title_en', 'title_ta'].map((name) => field(name))}
          {(announcement ? ['body_en', 'body_ta'] : ['text_en', 'text_ta']).map((name) => field(name, { text: true }))}
          {announcement && <>
            {field('channel', { choices: ['banner', 'bell'], fallback: 'banner' })}
            {field('start_at', { type: 'datetime-local' })}
            {field('end_at', { type: 'datetime-local' })}
            {field('week_min', { type: 'number', required: false })}
            {field('week_max', { type: 'number', required: false })}
            {field('delivery_type', { choices: ['', 'vaginal', 'csection'] })}
            {field('language', { choices: ['', 'en', 'ta'] })}
            {field('plan', { required: false })}
            <p>Use local time. A specific plan matches zero accounts until subscription data is available.</p>
            <button type="button" onClick={() => run('preview')}>Preview audience count</button>
            {count !== null && <p role="status">{count} eligible accounts</p>}
          </>}
          {tip && field('week', { type: 'number' })}
          {resource === 'reminder_templates' && field('key', { choices: keys, fallback: 'water' })}
        </fieldset>
        <div className="my-4 flex flex-wrap gap-3 [&_button]:rounded-lg [&_button]:border [&_button]:border-[#F2DEE5] [&_button]:px-3 [&_button]:py-2 [&_button]:text-[#7B2346]">
          <button type="button" disabled={busy} onClick={() => {
            if (!dirty || window.confirm('Discard unsaved changes?')) close()
          }}>Close</button>
          {editable && <button type="submit" disabled={busy}>Save draft</button>}
          {canDelete && announcement && record.id && stage === 'draft' && !dirty &&
            <button type="button" disabled={busy} onClick={() => setConfirmation('delete')}>Delete draft</button>}
          {!dirty && record.id && (tip ? <>
            {canEdit && stage === 'draft' && <button type="button" disabled={busy} onClick={() => setConfirmation('submit')}>Submit for review</button>}
            {canEdit && ['draft', 'in_review'].includes(stage) && <button type="button" disabled={busy} onClick={() => setConfirmation('archive')}>Archive</button>}
          </> : canPublish && <button type="button" disabled={busy}
            onClick={() => setConfirmation(record.status === 'draft' ? 'publish' : 'unpublish')}>
            {record.status === 'draft' ? 'Publish' : 'Unpublish'}
          </button>)}
        </div>
        {confirmation && <div role="group" aria-label="Confirm editorial action">
          <p>Confirm {confirmation}?</p>
          <button type="button" disabled={busy} onClick={() => run(confirmation)}>Confirm</button>
          <button type="button" disabled={busy} onClick={() => setConfirmation('')}>Cancel</button>
        </div>}
      </form>
      {tip && stage === 'in_review' && <p>Approval and publication are managed in Clinical Review.</p>}
    </section>
  )
}

function NotificationTable({ token, resource, canEdit, canPublish, canDelete, onEditorOpen }) {
  const [params, setParams] = useState({ page: 1, page_size: 10 })
  const [rows, setRows] = useState({ items: [], total: 0 })
  const [record, setRecord] = useState(null)
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = () => setVersion((value) => value + 1)
  const search = useCallback((value) => setParams((state) => state.search === value ? state : { ...state, search: value, page: 1 }), [])
  useEffect(() => {
    const controller = new AbortController()
    notificationsRequest(token, '/' + resource + '?' + new URLSearchParams(params), 'GET', undefined, controller.signal)
      .then((result) => { setRows(result); setError('') })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [params, resource, token, version])
  function openEditor(item) {
    setRecord(item)
    onEditorOpen(Boolean(item))
  }
  if (record) return <Editor resource={resource} record={record} token={token}
    canEdit={canEdit} canPublish={canPublish} canDelete={canDelete}
    close={() => openEditor(null)} reload={refresh} />
  const field = resource === 'announcements' ? 'title_en' : resource === 'daily_tips' ? 'text_en' : 'key'
  const columns = [
    { field, headerName: resource === 'reminder_templates' ? 'Template' : 'English content', flex: 1, minWidth: 180 },
    { field: resource === 'announcements' ? 'lifecycle' : 'status', headerName: 'Status', width: 125, renderCell: ({ value }) => <AdminStatusChip status={value} /> },
    ...(resource === 'daily_tips' ? [{ field: 'week', headerName: 'Week', width: 90 }] : []),
  ]
  return <>
    {error && <p role="alert">{error}</p>}
    <AdminTable title={resources[resource][0]} rows={rows.items} total={rows.total} columns={columns}
      loading={loading} page={params.page - 1} pageSize={params.page_size} onSearchChange={search}
      onPageChange={(page) => { setLoading(true); setParams((state) => ({ ...state, page: page + 1 })) }}
      onPageSizeChange={(page_size) => { setLoading(true); setParams((state) => ({ ...state, page: 1, page_size })) }}
      filters={[{ key: 'status', label: 'Status', options: resources[resource][1].map((value) => ({ value, label: label(value) })) }]}
      onFilterChange={({ status }) => setParams((state) => ({ ...state, page: 1, status: status || '' }))}
      onView={openEditor} onCreate={canEdit ? () => openEditor({}) : undefined} onRefresh={refresh} />
  </>
}

export default function NotificationsManager({ token, permissions }) {
  const [resource, setResource] = useState('announcements')
  const [editorOpen, setEditorOpen] = useState(false)
  const canEdit = permissions.includes('notifications.create')
  const canPublish = permissions.includes('notifications.send')
  return (
    <div>
      <nav className="my-4 flex flex-wrap gap-3 [&_button]:rounded-lg [&_button]:border [&_button]:border-[#F2DEE5] [&_button]:px-3 [&_button]:py-2 [&_button]:text-[#7B2346]" aria-label="Notification resources">
        {Object.entries(resources).map(([key, [title]]) => <button type="button" key={key}
          disabled={editorOpen} aria-pressed={resource === key} onClick={() => setResource(key)}>{title}</button>)}
      </nav>
      <NotificationTable key={resource} resource={resource} token={token} canEdit={canEdit} canPublish={canPublish} canDelete={permissions.includes('notifications.manage')} onEditorOpen={setEditorOpen} />
    </div>
  )
}
