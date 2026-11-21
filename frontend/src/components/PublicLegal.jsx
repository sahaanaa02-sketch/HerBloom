import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogTitle } from '@mui/material'
import SafeMarkdown from './SafeMarkdown'
import { apiBase } from '../services/apiBase'

import { legalLabels } from '../services/legalTypes'

const labelKeys = { privacy: 'privacy_policy', terms: 'terms_of_use', refund: 'refund_policy', disclaimer: 'disclaimer' }

export default function PublicLegal({ landing = false }) {
  const [documents, setDocuments] = useState([])
  const [settings, setSettings] = useState(null)
  const [selected, pick] = useState(null)
  const { t, i18n } = useTranslation('auth')
  const [contentLanguage, setContentLanguage] = useState(null)
  const lang = contentLanguage ?? i18n.resolvedLanguage
  useEffect(() => {
    const controller = new AbortController()
    async function load(path, save) {
      try {
        const response = await fetch(apiBase + '/api/public/' + path, { signal:controller.signal })
        if (response.ok) save(await response.json())
      } catch { /* Keep the existing page available if optional public content is offline. */ }
    }
    load('legal',setDocuments)
    load('settings',setSettings)
    return () => controller.abort()
  }, [])
  const languages = settings?.supported_languages ?? ['en','ta']
  const language = languages.includes(lang) ? lang : 'en'
  const banner = settings?.['maintenance_banner_' + language]
  if (!landing && !documents.length && !banner && !settings?.support_email) return null
  return <section aria-label={t('herbloom_legal_information')} className={landing ? 'space-y-2' : 'mt-6 space-y-3 text-sm text-[#7B2346]'}>
    {banner && <p role="status" lang={language} className="whitespace-pre-wrap rounded-lg border border-[#F6D3DB] p-2">{banner}</p>}
    {landing && !documents.length && <p>{t('privacy_policy_and_terms_of_use_are_coming_soon')}</p>}
    <div className="flex flex-wrap items-center gap-3">
      {documents.map((doc) => <button key={doc.type} type="button" className="underline" onClick={() => pick(doc)}>{t(labelKeys[doc.type], { defaultValue: legalLabels[doc.type] })}</button>)}
      {settings?.support_email && <a className="underline" href={'mailto:' + settings.support_email}>{t('contact_support')}</a>}
      {banner && languages.includes('ta') && <select aria-label={t('notice_language')} value={language} onChange={(event) => setContentLanguage(event.target.value)}>
        <option value="en">English</option><option value="ta" lang="ta">தமிழ்</option>
      </select>}
    </div>
    {selected && <Dialog open fullWidth maxWidth="md" onClose={() => pick(null)}>
      <DialogTitle>{t(labelKeys[selected.type], { defaultValue: legalLabels[selected.type] })}</DialogTitle>
      <DialogContent dividers>
        {languages.map((key) => <Button key={key} aria-pressed={language===key} onClick={() => setContentLanguage(key)}>{key==='en'?'English':'தமிழ்'}</Button>)}
        <article lang={language} className="mt-3 space-y-3"><SafeMarkdown body={selected['body_' + language]} /></article>
        <Button onClick={() => pick(null)}>{t('close')}</Button>
      </DialogContent>
    </Dialog>}
  </section>
}
