import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Alert, Button, TextField } from '@mui/material'
import AdminTable from './AdminTable'
import { clinicalReviewRequest } from '../../services/adminApi'

const labels = {
  daily_tips: 'Daily tips',
  articles: 'Articles', recovery_exercises: 'Exercises', wellbeing_activities: 'Wellbeing Activities',
  meal_ideas: 'Meal Ideas', warning_signs: 'Warning signs', red_flag_terms: 'Red-flag terms',
  safety_messages: 'Safety messages', helplines: 'Helplines', nutrition_target_values: 'Nutrition targets',
}
const statuses = { pending: 'Pending', approved: 'Approved', changes_requested: 'Changes requested', superseded: 'Superseded', all: 'All' }
const columns = [
  { field: 'entity', headerName: 'Content type', minWidth: 150, renderCell: ({ value }) => labels[value] },
  { field: 'title', headerName: 'Title', minWidth: 175, flex: 1 },
  { field: 'submitter', headerName: 'Submitted by', minWidth: 130 },
  { field: 'waiting_days', headerName: 'Waiting days', width: 125 },
  { field: 'decision', headerName: 'Status', minWidth: 145, renderCell: ({ row }) => row.superseded_at && row.decision === 'pending' ? 'Superseded' : statuses[row.decision] },
]
const dueColumns = [
  columns[0], columns[1], { field: 'next_review_due', headerName: 'Review due', width: 130 },
  { field: 'overdue', headerName: 'Status', width: 135, renderCell: ({ value }) => value ? 'Overdue' : 'Due soon' },
]

function compare(value) {
  return value == null ? '?' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function ReviewDetail({ review, busy, onAction, close }) {
  const { t: auditText } = useTranslation()
  const { t: localizeCopy } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [lang, setLang] = useState('en')
  const [comment, setComment] = useState('')
  const previous = review.previous ?? {}
  const keys = [...new Set([...Object.keys(review.current), ...Object.keys(previous)])].filter((key) =>
    lang === 'en' ? !key.endsWith('_ta') : key.endsWith('_ta'))
  return <section className="space-y-4">
    <Button onClick={close}>{uiText('back_to_reviews')}</Button>
    <div>
      <h2 className="text-xl font-semibold">{review.title}</h2>
      <p>{labels[review.entity]} ? {statuses[review.decision]}{review.published ? auditText('common:published_2') : ''}</p>
      {review.next_review_due && <p>{uiText('next_review_due')} {review.next_review_due}</p>}
    </div>
    <div className="flex gap-2" aria-label={uiText('comparison_language')}>
      {[['en','English and shared fields'], ['ta','Tamil']].map(([value,label]) =>
        <Button key={value} aria-pressed={lang===value} onClick={() => setLang(value)}>{label}</Button>)}
    </div>
    {!review.previous && <p>{uiText('no_previous_published_version_for_this_record')}</p>}
    {!keys.length && <p>{uiText('no_fields_in_this_language')}</p>}
    {keys.map((key) => {
      const changed = compare(previous[key]) !== compare(review.current[key])
      return <div key={key} className={'rounded-xl border p-3 ' + (changed ? 'border-[#D9A25B] bg-[#FFF6F1]' : 'border-[#F6D3DB]')}>
        <h3 className="font-semibold">{key.replaceAll('_',' ')}{changed ? auditText('common:changed_2') : ''}</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div><span className="font-semibold">{localizeCopy('common:previous_published')}</span><p className="whitespace-pre-wrap break-words">{compare(previous[key])}</p></div>
          <div><span className="font-semibold">{localizeCopy('common:submitted_revision')}</span><p className="whitespace-pre-wrap break-words">{compare(review.current[key])}</p></div>
        </div>
      </div>
    })}
    {review.can_decide && <div className="space-y-2">
      <TextField label={auditText('common:comment_for_requesting_changes')} multiline fullWidth value={comment} onChange={(event) => setComment(event.target.value)} />
      <Button disabled={busy || !comment.trim()} onClick={() => onAction('request-changes', { comment })}>{uiText('request_changes')}</Button>
      <Button disabled={busy} onClick={() => onAction('approve')}>{uiText('approve')}</Button>
    </div>}
    {review.can_publish && <Button variant="contained" disabled={busy} onClick={() => {
      if (window.confirm(uiText('publish_this_approved_revision'))) onAction('publish')
    }}>{uiText('publish')}</Button>}
    {review.can_revise && <Button disabled={busy} onClick={() => {
      if (window.confirm(uiText('reopen_for_editing_and_invalidate_any_current_approval'))) onAction('revise')
    }}>{localizeCopy('common:reopen_for_editing')}</Button>}
    {review.can_resubmit && <Button disabled={busy} onClick={() => onAction('re-review')}>{localizeCopy('common:submit_for_re_review')}</Button>}
    <h3 className="font-semibold">{uiText('review_history')}</h3>
    <ul className="space-y-2">{review.history.map((item) => <li key={item.id}>
      {statuses[item.decision]} ? {(item.decided_at ?? item.created_at).slice(0,10)}{item.comment && <p className="whitespace-pre-wrap">{item.comment}</p>}
    </li>)}</ul>
  </section>
}

export default function ClinicalReviewManager({ token, initialTab = 'queue' }) {
  const { t: auditText } = useTranslation()
  const { t: localizeCopy } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [tab, setTab] = useState(initialTab)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [entity, setEntity] = useState('')
  const [status, setStatus] = useState('pending')
  const [revision, refresh] = useState(0)
  const [result, setResult] = useState({ items: [], total: 0, entities: [] })
  const [details, setDetails] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ status, page: page + 1, page_size: pageSize })
    if (entity) params.set('entity', entity)
    const path = tab === 'due' ? '/due' : '?' + params
    clinicalReviewRequest(token, path).then((data) => {
      if (active) setResult(tab === 'due' ? { items: data, total: data.length, entities: [] } : data)
    }).catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [entity, page, pageSize, revision, status, tab, token])

  async function open(row) {
    setError('')
    try { setDetails(await clinicalReviewRequest(token, '/' + (tab === 'due' ? row.review_id : row.id))) }
    catch (reason) { setError(reason.message) }
  }
  async function action(name, payload) {
    if (busy) return
    setBusy(true)
    setError('')
    const path = name === 'revise' || name === 're-review'
      ? '/resource/' + details.entity + '/' + details.entity_id + '/' + name
      : '/' + details.id + '/' + name
    try {
      await clinicalReviewRequest(token, path, 'POST', payload)
      setDetails(await clinicalReviewRequest(token, '/' + details.id))
      refresh((value) => value + 1)
    } catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }
  return <div className="space-y-4">
    {error && <Alert severity="error">{error}</Alert>}
    {details ? <ReviewDetail key={details.id} review={details} busy={busy} onAction={action} close={() => setDetails(null)} /> : <>
      <nav aria-label={auditText('common:clinical_review_sections')} className="flex gap-2">
        {[['queue','Review queue'],['due','Due for re-review']].map(([id,label]) =>
          <Button key={id} aria-pressed={tab===id} variant={tab===id?'contained':'outlined'} onClick={() => {
            setError(''); setTab(id); setPage(0)
          }}>{label}</Button>)}
      </nav>
      {tab === 'queue' && <div className="flex flex-wrap gap-4">
        <label>{uiText('content_type')} <select value={entity} onChange={(event) => { setError(''); setEntity(event.target.value); setPage(0) }}>
          <option value="">{localizeCopy('common:all_types')}</option>{result.entities.map((key) => <option value={key} key={key}>{labels[key]}</option>)}
        </select></label>
        <label>{localizeCopy('common:review_status')} <select value={status} onChange={(event) => { setError(''); setStatus(event.target.value); setPage(0) }}>
          {Object.entries(statuses).map(([value,label]) => <option value={value} key={value}>{label}</option>)}
        </select></label>
      </div>}
      <AdminTable key={tab} title={tab==='due'?auditText('common:due_for_re_review'):auditText('common:review_queue')} columns={tab==='due'?dueColumns:columns}
        rows={tab==='due'?result.items.slice(page*pageSize,(page+1)*pageSize):result.items} total={result.total}
        onView={open} page={page} pageSize={pageSize} onPageChange={setPage}
        onPageSizeChange={(value) => { setPageSize(value); setPage(0) }} />
    </>}
  </div>
}
