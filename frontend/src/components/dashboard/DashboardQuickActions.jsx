
import {
  Camera,
  Droplets,
  Wind,
  MessageCircle,
  ArrowUpRight,
} from 'lucide-react'

const actions = [
  {
    id: 'scan',
    label: 'Scan a Meal',
    description: 'Food recognition',
    Icon: Camera,
    bg: '#FFF0E4',
    color: '#C48649',
  },
  {
    id: 'water',
    label: 'Log Water',
    description: 'Stay hydrated',
    Icon: Droplets,
    bg: '#E9F5FF',
    color: '#619ED0',
  },
  {
    id: 'breathing',
    label: 'Start Breathing',
    description: 'A calm moment',
    Icon: Wind,
    bg: '#F3EAFB',
    color: '#9B75BA',
  },
  {
    id: 'ask',
    label: 'Ask HerBloom',
    description: 'Find guidance',
    Icon: MessageCircle,
    bg: '#FBE9EF',
    color: '#AD5D7A',
  },
]

export default function DashboardQuickActions({ onAction }) {
  return (
    <section className="rounded-[26px] border border-[#F3E2E6] bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="font-['Playfair_Display'] text-xl font-semibold text-[#3A1224]">
          Quick Actions
        </h2>
        <p className="mt-1 text-xs text-[#987B86]">
          Everything you need, just a tap away
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {actions.map(({ id, label, description, Icon, bg, color }) => (
          <button
            key={id}
            type="button"
            onClick={() => onAction?.(id)}
            className="group flex flex-col items-start rounded-2xl border border-[#F5E9EB] p-4 text-left transition hover:-translate-y-1 hover:shadow-md"
          >
            <div
              className="mb-4 rounded-xl p-3"
              style={{ backgroundColor: bg, color }}
            >
              <Icon size={21} />
            </div>

            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[#3A1224]">
                {label}
              </span>

              <ArrowUpRight
                size={15}
                className="shrink-0 text-[#A88C98]"
              />
            </div>

            <span className="mt-1 text-xs text-[#987B86]">
              {description}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
