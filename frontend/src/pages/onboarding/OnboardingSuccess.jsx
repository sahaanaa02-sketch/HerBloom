import { useOnboardingCopy } from '../../locales/useOnboardingCopy'
import { ArrowRight, Check } from 'lucide-react'

export default function OnboardingSuccess({ userName, onGoToDashboard }) {
  const t = useOnboardingCopy()
  const name = userName?.trim()

  return (
    <section className="flex min-h-[20rem] flex-col items-center justify-center px-2 py-8 text-center">
      <div role="status" className="flex flex-col items-center">
        <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#F6D3DB] text-[#7B2346]">
          <Check size={38} aria-hidden="true" />
        </span>
        <h1 tabIndex={-1} className="font-['Playfair_Display'] text-3xl font-semibold text-[#7B2346] sm:text-4xl">
          {name ? t("You're all set, {{name}}!", { name }) : t("You're all set!")}
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-[#765363]">
          {t('Your HerBloom space is ready to support your recovery journey.')}
        </p>
      </div>
      <button type="button" onClick={onGoToDashboard}
        className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#7B2346] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#651C39] focus-visible:ring-2 focus-visible:ring-[#7B2346] focus-visible:ring-offset-2"
      >
        {t('Go to My Dashboard')}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    </section>
  )
}
