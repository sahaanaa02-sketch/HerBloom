import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField } from '@mui/material'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import AdminTable, { AdminStatusChip } from './AdminTable'
import { safetyAdminRequest } from '../../services/adminApi'

const resources = {
  'warning-signs': ['Warning signs', { audience: 'Audience', text_en: 'English text', text_ta: 'Tamil text', sort_order: 'Order' }],
  'red-flag-terms': ['Red-flag terms', { term: 'Term', lang: 'Language', category: 'Category', active: 'Active when published' }],
  messages: ['Safety messages', { message_key: 'Message', body_en: 'English message', body_ta: 'Tamil message' }],
  helplines: ['Helplines', { name_en: 'English name', name_ta: 'Tamil name', number: 'Number', description_en: 'English description', description_ta: 'Tamil description', sort_order: 'Order', active: 'Active when published' }],
}
const choices = {
  audience: { mother: 'Mother', baby: 'Baby' },
  lang: { en: 'English', ta: 'Tamil' },
  category: { urgent: 'Urgent', crisis: 'Crisis' },
  message_key: { urgent_card: 'Urgent card', crisis_card: 'Crisis card', no_info: 'No information' },
}
const empty = { items: [], total: 0 }

function fieldsFor(resource, row) {
  return Object.fromEntries(Object.keys(resources[resource][1]).map((key) =>
    [key, row?.[key] ?? (key === 'active' ? true : key === 'sort_order' ? 0 : Object.keys(choices[key] ?? {})[0] ?? '')]))
}

function EventChart({ counts }) {
  const series = [...new Set(counts.map(({ category, source }) => category + ' / ' + source))]
  const weeks = Object.values(counts.reduce((values, { week, category, source, count }) => {
    const entry = values[week] ?? { week }
    entry[category + ' / ' + source] = count
    values[week] = entry
    return values
  }, {}))
  if (!weeks.length) return <Alert severity="info">No safety events in the past eight weeks.</Alert>
  return <div className="h-80" role="img" aria-label="Weekly safety event totals by category and source">
    <ResponsiveContainer width="100%" height="100%"><BarChart data={weeks}>
      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="week" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
      {series.map((key, index) => <Bar key={key} dataKey={key} fill={['#7B2346', '#D9A25B', '#3A1224', '#A65C74'][index % 4]} />)}
    </BarChart></ResponsiveContainer>
  </div>
}

function Tester({ send }) {
  const [text, setText] = useState('')
  const [lang, setLang] = useState('en')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function test(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setResult(null)
    try { setResult(await send('/test', 'POST', { text, lang })) }
    catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }
  return <form className="grid max-w-2xl gap-4" onSubmit={test}>
    <p>Use a synthetic phrase to test the rules currently used by the chatbot. The tester does not store your input.</p>
    <TextField select label="Language" value={lang} onChange={(event) => setLang(event.target.value)}>
      {Object.entries(choices.lang).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
    </TextField>
    <TextField required multiline minRows={3} label="Test phrase" value={text} onChange={(event) => setText(event.target.value)}
      slotProps={{ htmlInput: { maxLength: 4000 } }} />
    <Button type="submit" variant="contained" disabled={busy || !text.trim()}>Test phrase</Button>
    {error && <Alert severity="error">{error}</Alert>}
    {result && <Alert severity="info">{result.result === 'none' ? 'No match' : result.result + ' matched: ' + result.matched_term}</Alert>}
  </form>
}

export default function SafetyManager({ token, permissions }) {
  const [tab, setTab] = useState('warning-signs')
  const [page, setPage] = useState(0)
  const [pageSize, setSize] = useState(10)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState(null)
  const [editor, setEditor] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canEdit = permissions.includes('safety.edit')
  const canRead = permissions.includes('safety.view')
  const send = useMemo(() => (path, method, body) => safetyAdminRequest(token, path, method, body), [token])
  const query = useMemo(() => ({ tab, page, pageSize, revision }), [tab, page, pageSize, revision])
  useEffect(() => {
    if (!canRead || query.tab === 'test') return
    let current = true
    const suffix = query.tab === 'events' ? '' : '?' + new URLSearchParams({ page: query.page + 1, page_size: query.pageSize })
    send('/' + query.tab + suffix).then((data) => {
      if (current) setResult({ query, data })
    }).catch((reason) => { if (current) setResult({ query, error: reason.message }) })
    return () => { current = false }
  }, [canRead, query, send])

  function open(row) {
    setError('')
    setEditor({ row, data: fieldsFor(tab, row) })
  }

  async function mutate(method) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await send('/' + tab + (editor.row ? '/' + editor.row.id : ''), method, method === 'DELETE' ? undefined : editor.data)
      setEditor(null)
      setRevision((value) => value + 1)
    } catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }

  if (!canRead) return <Alert severity="warning">Safety viewing permission is required.</Alert>
  const selected = result?.query === query ? result : null
  const activeResource = resources[tab]
  const readOnly = !canEdit || (editor?.row && editor.row.status !== 'in_review')
  const columns = activeResource ? [
    ...Object.entries(activeResource[1]).map(([field, headerName]) => ({
      field, headerName, minWidth: 125, flex: 1,
      renderCell: ({ value }) => choices[field]?.[value] ?? (typeof value === 'boolean' || field === 'active' ? value ? 'Yes' : 'No' : value),
    })),
    ...(tab === 'messages' ? [{ field: 'version', headerName: 'Version', width: 90 }] : []),
    { field: 'status', headerName: 'Status', width: 130, renderCell: ({ value }) => <AdminStatusChip status={value} /> },
  ] : []
  return <div className="space-y-4">
    <Alert severity="error">Changes here affect mothers’ safety. All changes need clinical approval.</Alert>
    <nav aria-label="Safety sections" className="flex flex-wrap gap-2">
      {[...Object.entries(resources).map(([key, [label]]) => [key, label]), ['test', 'Term tester'], ['events', 'Safety events']].map(([key, label]) =>
        <Button key={key} aria-pressed={tab === key} variant={tab === key ? 'contained' : 'outlined'} onClick={() => { setTab(key); setPage(0) }}>{label}</Button>)}
    </nav>
    {selected?.error && <Alert severity="error">{selected.error}</Alert>}
    {tab === 'test' && <Tester send={send} />}
    {tab === 'events' && selected?.data && <EventChart counts={selected.data} />}
    {tab === 'events' && !selected && <p>Loading safety event counts…</p>}
    {activeResource && <AdminTable key={tab} title={activeResource[0]} rows={(selected?.data ?? empty).items}
      total={(selected?.data ?? empty).total} columns={columns} loading={!selected} page={page} pageSize={pageSize}
      onPageChange={setPage} onPageSizeChange={(value) => { setSize(value); setPage(0) }}
      onCreate={canEdit && !selected?.error ? () => open() : undefined} onView={open}
      onRefresh={() => setRevision((value) => value + 1)} />}
    {editor && <Dialog open fullWidth maxWidth="md" onClose={() => { if (!busy) setEditor(null) }}>
      <form onSubmit={(event) => { event.preventDefault(); if (!readOnly) mutate(editor.row ? 'PUT' : 'POST') }}>
        <DialogTitle>{activeResource[0]}{editor.row?.version ? ' · Version ' + editor.row.version : ''}</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(activeResource[1]).map(([field, label]) => {
              const change = (value) => setEditor((current) => ({ ...current, data: { ...current.data, [field]: value } }))
              if (field === 'active') return <FormControlLabel key={field} label={label}
                control={<Checkbox checked={Boolean(editor.data[field])} disabled={readOnly || busy} onChange={(event) => change(event.target.checked)} />} />
              return <TextField key={field} label={label} value={editor.data[field]} required select={Boolean(choices[field])}
                disabled={readOnly || busy || (field === 'message_key' && Boolean(editor.row))}
                multiline={/^(text|body|description)_/.test(field)} type={field === 'sort_order' ? 'number' : 'text'}
                onChange={(event) => change(field === 'sort_order' ? Number(event.target.value) : event.target.value)}>
                {choices[field] && Object.entries(choices[field]).map(([value, option]) => <MenuItem value={value} key={value}>{option}</MenuItem>)}
              </TextField>
            })}
          </div>
        </DialogContent>
        <DialogActions>
          {!readOnly && editor.row && <Button color="error" disabled={busy} onClick={() => {
            if (window.confirm('Archive this safety proposal?')) mutate('DELETE')
          }}>Archive</Button>}
          <Button disabled={busy} onClick={() => setEditor(null)}>Close</Button>
          {!readOnly && <Button disabled={busy} type="submit" variant="contained">Save for review</Button>}
        </DialogActions>
      </form>
    </Dialog>}
  </div>
}
