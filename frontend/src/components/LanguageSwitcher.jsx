import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { selectLocalLanguage } from '../locales/i18n'

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  return (
    <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#7B2346]">
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">{t('language')}</span>
      <select className="min-h-10 max-w-full rounded bg-transparent focus-visible:outline-[#7B2346]"
        value={i18n.resolvedLanguage} onChange={event => selectLocalLanguage(event.target.value)}>
        <option value="en" lang="en">English</option>
        <option value="ta" lang="ta">&#2980;&#2990;&#3007;&#2996;&#3021;</option>
      </select>
    </label>
  )
}
