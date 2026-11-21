import { useOnboardingCopy } from '../../locales/useOnboardingCopy'

import { Check } from 'lucide-react'

export const COLORS = {
  berry: '#7B2346',
  burgundy: '#3A1224',
  pink: '#F6D3DB',
  cream: '#FFF6F1',
  gold: '#D9A25B',
}

export function QuestionCard({
  icon: Icon,
  title,
  helper,
  required = false,
  children,
}) {
  const copy = useOnboardingCopy()
  return (
    <section className="rounded-2xl border border-[#F1D9DF] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {Icon && (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FCE7EB] text-[#7B2346]">
              <Icon size={20} />
            </span>
          )}

          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-6 text-[#3A1224]">
              {copy(title)}
              {required && <span className="ml-1 text-red-600">*</span>}
            </h3>

            <span className="mt-1 inline-block rounded-full bg-[#FBEAF0] px-2 py-0.5 text-[11px] text-[#7B2346]">
              {copy(required ? 'Required' : 'Skip if you prefer')}
            </span>

            {helper && (
              <p className="mt-2 text-xs leading-5 text-[#765363]">
                {copy(helper)}
              </p>
            )}
          </div>
        </div>

        <div className="w-full min-w-0 lg:w-[52%]">
          {children}
        </div>
      </div>
    </section>
  )
}

export function ChoiceButton({
  selected = false,
  onClick,
  children,
  disabled = false,
  multiple = false,
}) {
  const copy = useOnboardingCopy()
  return (
    <button
      type="button"
      disabled={disabled}
      role={multiple ? 'checkbox' : 'radio'}
      aria-checked={selected === true}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B2346] ${
        selected
          ? 'border-[#7B2346] bg-[#FBE7EC] text-[#7B2346]'
          : 'border-[#E8C3CC] bg-white text-[#3A1224] hover:border-[#7B2346] hover:bg-[#FFF6F1]'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {multiple ? (
        <span
          aria-hidden="true"
          className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[5px] border-2 ${
            selected
              ? 'border-[#7B2346] bg-[#7B2346] text-white'
              : 'border-[#CDAAB7] bg-white'
          }`}
        >
          {selected && <Check size={13} strokeWidth={3} />}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border-2 ${
            selected
              ? 'border-[#7B2346]'
              : 'border-[#CDAAB7]'
          }`}
        >
          {selected && (
            <span className="h-[9px] w-[9px] rounded-full bg-[#7B2346]" />
          )}
        </span>
      )}

      <span>{typeof children === 'string' ? copy(children) : children}</span>
    </button>
  )
}

export function StepHeading({ title, subtitle }) {
  const copy = useOnboardingCopy()
  return (
    <div className="mb-5 text-center">
      <h1 className="font-['Playfair_Display'] text-[clamp(25px,2.3vw,34px)] font-semibold leading-tight text-[#7B2346]">
        {copy(title)}
      </h1>

      {subtitle && (
        <p className="mt-2 text-sm leading-6 text-[#765363]">
          {copy(subtitle)}
        </p>
      )}
    </div>
  )
}

export function TextField({
  value,
  onChange,
  placeholder,
  type = 'text',
  maxLength,
  min,
  max,
}) {
  const copy = useOnboardingCopy()
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={copy(placeholder)}
      maxLength={maxLength}
      min={min}
      max={max}
      className="min-h-12 w-full min-w-0 rounded-xl border border-[#E8C3CC] bg-white px-4 text-sm text-[#3A1224] outline-none transition focus:border-[#7B2346] focus:ring-2 focus:ring-[#F6D3DB]"
    />
  )
}
