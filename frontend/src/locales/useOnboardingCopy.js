import { useTranslation } from 'react-i18next'
import resource from './onboarding.json'

const keys = new Map(Object.entries(resource.en).map(([key, value]) => [value, key]))

export function useOnboardingCopy() {
  const { t } = useTranslation('onboarding')
  return (text, options) => keys.has(text) ? t(keys.get(text), options) : text
}
