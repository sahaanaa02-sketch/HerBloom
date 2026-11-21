import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateProfile } from '../services/profileApi'

export function useMotherLanguage(token, onProfileSaved) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  async function chooseLanguage(code) {
    if (pending.current || code === language || !['en', 'ta'].includes(code)) return
    pending.current = true
    setSaving(true)
    setFailed(false)
    try {
      const { profile } = await updateProfile(token, { language: code })
      onProfileSaved(profile)
    } catch {
      setFailed(true)
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  return { language, chooseLanguage, savingLanguage: saving, languageError: failed }
}
