import { wellbeingTranslations } from './wellbeing.js'
import { createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import common from './common.json' with { type: 'json' }
import landing from './landing.json' with { type: 'json' }
import auth from './auth.json' with { type: 'json' }
import onboarding from './onboarding.json' with { type: 'json' }
import mother from './mother.json' with { type: 'json' }
import admin from './admin.json' with { type: 'json' }

const storageKey = 'herbloom-ui-language'

export function normalizeLanguage(value) {
  return value === 'ta' ? 'ta' : 'en'
}

export function localLanguage(storage) {
  try {
    storage ??= globalThis.localStorage
    return normalizeLanguage(storage?.getItem(storageKey))
  } catch {
    return 'en'
  }
}

export const i18n = createInstance().use(initReactI18next)
i18n.init({
  resources: {
    en: { common: common.en, landing: landing.en, auth: auth.en, onboarding: onboarding.en, mother: { ...mother.en, wellbeing: wellbeingTranslations.en }, admin: admin.en },
    ta: { common: common.ta, landing: landing.ta, auth: auth.ta, onboarding: onboarding.ta, mother: { ...mother.ta, wellbeing: wellbeingTranslations.ta }, admin: admin.ta },
  },
  lng: localLanguage(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'ta'],
  ns: ['common', 'landing', 'auth', 'onboarding', 'mother', 'admin'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  initAsync: false,
})

function updateDocumentLanguage(language) {
  if (globalThis.document) document.documentElement.lang = normalizeLanguage(language)
}

i18n.on('languageChanged', updateDocumentLanguage)
updateDocumentLanguage(i18n.language)

export function selectLocalLanguage(value) {
  const language = normalizeLanguage(value)
  try {
    globalThis.localStorage?.setItem(storageKey, language)
  } catch {
    // Language selection still works for the current page.
  }
  return i18n.changeLanguage(language)
}
