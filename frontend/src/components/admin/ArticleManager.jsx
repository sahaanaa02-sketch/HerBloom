import { useTranslation } from 'react-i18next'
import MarkdownPreview from '../SafeMarkdown'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import AdminTable, { AdminStatusChip } from './AdminTable'
import { AdminMediaImage, ImagePicker } from './AdminMediaPicker'
import {
  archiveAdminArticle, getAdminArticle, getAdminArticles,
  saveAdminArticle, submitAdminArticleForReview,
} from '../../services/adminApi'

const categories = [
  ['breastfeeding', 'Breastfeeding'], ['baby_care', 'Baby care'], ['recovery', 'Recovery'],
  ['traditional', 'Traditional care'], ['pelvic', 'Pelvic health'], ['faq', 'FAQ'], ['cycle', 'Cycle'],
]
const fields = [
  ['title', 'Title', 250], ['body', 'Body (Markdown)', 15000],
  ['key_points', 'Key points (one per line)', 25049], ['doctor_note', 'When to see a doctor', 15000],
]
const empty = {
  title_en: '', title_ta: '', body_en: '', body_ta: '', category: 'recovery', read_time: 4,
  key_points_en: '', key_points_ta: '', doctor_note_en: '', doctor_note_ta: '',
  min_week: '', max_week: '', delivery_type: 'any', safety_label: '', image_media_id: null,
  first_baby_only: false, is_premium: false,
}
const filters = [
  { key: 'category', label: 'Category', options: categories.map(([value, label]) => ({ value, label })) },
  { key: 'status', label: 'Status', options: [
    { value: 'draft', label: 'Draft' }, { value: 'in_review', label: 'In Review' },
    { value: 'archived', label: 'Archived' }, { value: 'published', label: 'Published' },
  ] },
  { key: 'tamil', label: 'Tamil', options: [{ value: 'missing', label: 'Tamil missing' }, { value: 'complete', label: 'Tamil complete' }] },
]
const columns = [
  { field: 'title_en', headerName: 'English title', minWidth: 180, flex: 1 },
  { field: 'title_ta', headerName: 'Tamil title', minWidth: 150, flex: 1 },
  { field: 'category', headerName: 'Category', minWidth: 140 },
  { field: 'status', headerName: 'Status', minWidth: 120, renderCell: ({ value }) => <AdminStatusChip status={value} /> },
]
const control = 'w-full rounded-lg border border-[#F6D3DB] bg-white px-3 py-2 text-[#3A1224]'

function toForm(article) {
  return Object.fromEntries(Object.keys(empty).map((key) => {
    const value = article[key]
    return [key, Array.isArray(value) ? value.join('\n') : value ?? empty[key]]
  }))
}

function toPayload(form, initial) {
  const payload = { ...form }
  for (const suffix of ['en', 'ta']) {
    const key = 'key_points_' + suffix
    payload[key] = form[key].split('\n').map((point) => point.trim()).filter(Boolean)
  }
  for (const key of ['read_time', 'min_week', 'max_week']) {
    payload[key] = form[key] === '' ? null : Number(form[key])
  }
  payload.safety_label ||= null
  if (form.image_media_id === initial.image_media_id) delete payload.image_media_id
  return payload
}

function ArticlePreview({ article, token }) {
  const { t: auditText } = useTranslation()
  const { t: localizeCopy } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [language, setLanguage] = useState('en')
  const text = (key) => article[key + '_' + language]
  return (
    <article className="space-y-5 rounded-xl bg-[#FFF6F1] p-5 text-[#3A1224]">
      <div className="flex gap-2" aria-label={uiText('preview_language')}>
        <Button aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</Button>
        <Button aria-pressed={language === 'ta'} onClick={() => setLanguage('ta')}>Tamil</Button>
      </div>
      <div className="space-y-4" lang={language}>
        <AdminMediaImage key={article.image_media_id} token={token} mediaId={article.image_media_id} legacyUrl={article.image_url} />
        <p>{article.category} · {article.read_time} min</p>
        {article.safety_label && <p>{article.safety_label.replaceAll('_', ' ')}</p>}
        <h2 className="text-2xl font-bold">{text('title') || localizeCopy('common:title_missing')}</h2>
        {text('key_points') && (
          <ul className="list-disc pl-6">{text('key_points').split('\n').filter(Boolean).map((point, i) => <li key={i}>{point}</li>)}</ul>
        )}
        <MarkdownPreview body={text('body') || ''} />
        {text('doctor_note') && <aside className="rounded-xl bg-amber-50 p-4"><strong>{auditText('common:when_to_see_a_doctor')}</strong><MarkdownPreview body={text('doctor_note')} /></aside>}
      </div>
    </article>
  )
}

function ArticleDialog({ detail, token, permissions, onClose, onSaved }) {
  const { t: auditText } = useTranslation()
  const { t: localizeCopy } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [initial] = useState(() => detail.article ? toForm(detail.article) : empty)
  const [form, setForm] = useState(initial)
  const [preview, setPreview] = useState(detail.mode === 'view')
  const [picker, setPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const dirty = detail.mode !== 'view' && JSON.stringify(form) !== JSON.stringify(initial)
  const readOnly = detail.mode === 'view'
  const article = detail.article
  const canUseMedia = permissions.includes('media.view')
  const canSubmit = article?.status === 'draft' && permissions.includes('content.edit')
  const canArchive = ['draft', 'in_review'].includes(article?.status) && permissions.includes('content.delete')
  useEffect(() => {
    if (!dirty) return
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function close() {
    if (!inFlight.current && (!dirty || window.confirm(uiText('discard_your_unsaved_article_changes')))) onClose()
  }
  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }
  async function mutate(operation) {
    if (inFlight.current) return
    inFlight.current = true
    setSaving(true)
    setError('')
    try {
      await operation()
      onSaved()
    } catch (reason) {
      setError(reason.message)
      setSaving(false)
    } finally {
      inFlight.current = false
    }
  }

  function submit(event) {
    event.preventDefault()
    if (readOnly || preview) return
    mutate(() => saveAdminArticle(token, article?.id, toPayload(form, initial)))
  }

  function archive() {
    if (inFlight.current || dirty || !window.confirm(uiText('archive_this_article_it_will_become_read_only'))) return
    mutate(() => archiveAdminArticle(token, article.id))
  }

  return (
    <Dialog open onClose={close} fullWidth maxWidth="md">
      <form onSubmit={submit}>
        <DialogTitle>{readOnly ? localizeCopy('common:article_preview') : detail.article ? localizeCopy('common:edit_draft') : localizeCopy('common:new_article_draft')}</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error">{error}</Alert>}
          {article && <AdminStatusChip status={article.status} />}
          {preview && (
            <ArticlePreview token={token} article={{ ...form, image_url: form.image_media_id === initial.image_media_id ? detail.article?.image_url : null }} />
          )}
          {!preview && (
            <fieldset disabled={saving} className="space-y-4">
              {(!form.title_ta.trim() || !form.body_ta.trim()) && <Alert severity="warning">{localizeCopy('common:tamil_title_or_body_is_missing')}</Alert>}
              {fields.map(([key, label, maxLength]) => (
                <div key={key} className="grid gap-4 sm:grid-cols-2">
                  {[['en', 'English'], ['ta', 'Tamil']].map(([lang, name]) => {
                    const field = key + '_' + lang
                    return (
                      <label key={field} className="block">
                        {label} · {name}
                        {key === 'title'
                          ? <input className={control} required={lang === 'en'} maxLength={maxLength} value={form[field]} onChange={(event) => change(field, event.target.value)} />
                          : <textarea className={control} rows={key === 'body' ? 7 : 3} maxLength={maxLength} value={form[field]} onChange={(event) => change(field, event.target.value)} />}
                      </label>
                    )
                  })}
                </div>
              ))}
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ['category', 'Category', categories],
                  ['delivery_type', 'Delivery type', [['any', 'Any'], ['vaginal', 'Vaginal'], ['csection', 'C-section']]],
                  ['safety_label', 'Safety label', [['', 'None'], ['helpful', 'Helpful'], ['care', 'Care'], ['not_recommended', 'Not recommended']]],
                ].map(([key, label, options]) => (
                  <label key={key}>{label}
                    <select className={control} value={form[key]} onChange={(event) => change(key, event.target.value)}>
                      {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                    </select>
                  </label>
                ))}
                {[
                  ['read_time', 'Reading time (minutes)', 1, 1440],
                  ['min_week', 'Minimum postpartum week', 0, 520],
                  ['max_week', 'Maximum postpartum week', 0, 520],
                ].map(([key, label, min, max]) => (
                  <label key={key}>{label}
                    <input className={control} type="number" min={min} max={max} required={key === 'read_time'} value={form[key]} onChange={(event) => change(key, event.target.value)} />
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.first_baby_only} onChange={(event) => change('first_baby_only', event.target.checked)} />
                  {auditText('common:first_baby_only')}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.is_premium} onChange={(event) => change('is_premium', event.target.checked)} />
                  {auditText('common:premium_content')}
                </label>
              </div>
              {canUseMedia && (
                <div>
                  <Button disabled={saving} onClick={() => setPicker((value) => !value)}>{localizeCopy('common:choose_library_image')}</Button>
                  {form.image_media_id && <Button disabled={saving} onClick={() => change('image_media_id', null)}>{localizeCopy('common:remove_selected_image')}</Button>}
                  {form.image_media_id && <AdminMediaImage key={form.image_media_id} token={token} mediaId={form.image_media_id} />}
                  {picker && <ImagePicker token={token} onSelect={(id) => { change('image_media_id', id); setPicker(false) }} />}
                </div>
              )}
            </fieldset>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap' }}>
          <Button disabled={saving} onClick={close}>{uiText('close')}</Button>
          {canArchive && <Button disabled={saving || dirty} onClick={archive}>{uiText('archive')}</Button>}
          {canSubmit && (
            <Button disabled={saving || dirty} onClick={() => mutate(() => submitAdminArticleForReview(token, article.id))}>
              {localizeCopy('common:submit_for_review_2')}
            </Button>
          )}
          {!readOnly && <Button disabled={saving} onClick={() => setPreview((value) => !value)}>{preview ? localizeCopy('common:back_to_editor') : localizeCopy('common:preview')}</Button>}
          {!readOnly && !preview && <Button variant="contained" type="submit" disabled={saving}>{saving ? localizeCopy('common:saving') : localizeCopy('common:save_draft')}</Button>}
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default function ArticleManager({ token, permissions }) {
  const { t: auditText } = useTranslation()
  const { t: localizeCopy } = useTranslation()
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
  const canEdit = permissions.includes('content.edit')
  const canCreate = permissions.includes('content.create')
  const onSearch = useCallback((value) => { setPage(0); setSearch(value) }, [])

  const query = useMemo(
    () => ({ filters: { page: page + 1, page_size: pageSize, search, ...selection }, revision }),
    [page, pageSize, search, selection, revision]
  )
  const currentList = list?.query === query ? list : null

  useEffect(() => {
    if (!canRead) return
    let active = true
    getAdminArticles(token, query.filters)
      .then((data) => { if (active) setList({ query, data }) })
      .catch((reason) => { if (active) setList({ query, error: reason.message }) })
    return () => { active = false }
  }, [canRead, query, token])

  async function openArticle(row, mode) {
    if (opening) return
    setOpening(true)
    setError('')
    try {
      const article = await getAdminArticle(token, row.id)
      setDetail({ mode: article.status === 'draft' ? mode : 'view', article })
    } catch (reason) {
      setError(reason.message)
    } finally {
      setOpening(false)
    }
  }

  if (!canRead) return <Alert severity="warning">{localizeCopy('common:article_viewing_permission_is_required')}</Alert>
  return (
    <>
      {(error || currentList?.error) && <Alert severity="error">{error || currentList.error}</Alert>}
      <AdminTable
        title={localizeCopy('admin:articles')}
        rows={currentList?.data?.items ?? []}
        total={list?.data?.total ?? 0}
        columns={columns}
        loading={!currentList || opening}
        page={page}
        pageSize={pageSize}
        filters={filters}
        onPageChange={setPage}
        onPageSizeChange={(value) => { setPage(0); setPageSize(value) }}
        onSearchChange={onSearch}
        onFilterChange={(values) => { setPage(0); setSelection(values) }}
        onRefresh={() => setRevision((value) => value + 1)}
        onCreate={() => setDetail({ mode: 'edit' })}
        onView={(row) => openArticle(row, 'view')}
        onEdit={(row) => openArticle(row, 'edit')}
        canCreate={canCreate}
        canEdit={canEdit}
        canEditRow={(row) => row.status === 'draft'}
        createLabel={auditText('common:new_draft')}
      />
      {detail && (
        <ArticleDialog
          detail={detail}
          token={token}
          permissions={permissions}
          onClose={() => setDetail(null)}
          onSaved={() => { setDetail(null); setRevision((value) => value + 1) }}
        />
      )}
    </>
  )
}
