
import {
  Footprints,
  Moon,
  Droplets,
  UtensilsCrossed,
  Plus,
  ArrowUpRight,
} from 'lucide-react'

const items = [
  {
    key: 'walk_minutes',
    title: 'Walking',
    unit: 'min',
    Icon: Footprints,
    color: '#73B8A5',
    bg: '#E9F7F1',
    action: 'walk',
    page: 'recovery',
  },
  {
    key: 'sleep_hours',
    title: 'Sleep',
    unit: 'hrs',
    Icon: Moon,
    color: '#B38BC9',
    bg: '#F5EAF9',
    action: null,
    page: 'recovery',
  },
  {
    key: 'water_glasses',
    title: 'Water',
    unit: 'glasses',
    Icon: Droplets,
    color: '#83B8E5',
    bg: '#EAF5FF',
    action: 'water',
    page: 'nutrition',
  },
  {
    key: 'meals_logged',
    title: 'Meals',
    unit: 'logged',
    Icon: UtensilsCrossed,
    color: '#E7B476',
    bg: '#FFF3E5',
    action: null,
    page: 'nutrition',
  },
]

export default function TodayOverview({
  data = {},
  onQuickLog,
  onNavigate,
}) {
  return (
    <section className="rounded-[26px] border border-[#F3E2E6] bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="font-['Playfair_Display'] text-xl font-semibold text-[#3A1224]">
          Today at a Glance
        </h2>
        <p className="mt-1 text-xs text-[#987B86]">
          Your daily activity, all in one place
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {items.map((item) => {
          const value = data[item.key]
          const Icon = item.Icon

          return (
            <div
              key={item.key}
              className="rounded-[22px] p-4"
              style={{ backgroundColor: item.bg }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="rounded-xl bg-white/80 p-2"
                  style={{ color: item.color }}
                >
                  <Icon size={20} />
                </span>

                <button
                  type="button"
                  aria-label={`Open ${item.title}`}
                  onClick={() => onNavigate?.(item.page)}
                  className="rounded-full p-1 text-[#8C7480] hover:bg-white"
                >
                  <ArrowUpRight size={17} />
                </button>
              </div>

              <p className="mt-5 text-xs font-medium text-[#866C78]">
                {item.title}
              </p>

              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-[#3A1224]">
                  {value == null ? '—' : value}
                </span>
                <span className="text-xs text-[#987B86]">
                  {item.unit}
                </span>
              </div>

              {item.action && (
                <button
                  type="button"
                  onClick={() => onQuickLog?.(item.action)}
                  className="mt-4 flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-semibold text-[#7B2346]"
                >
                  <Plus size={13} />
                  {item.action === 'walk' ? 'Add 10 min' : 'Add 1 glass'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
