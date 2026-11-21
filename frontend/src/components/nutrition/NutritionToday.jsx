import { useTranslation } from 'react-i18next'

import { Flame, Heart, Milk } from 'lucide-react'

const format = (value, digits = 1) =>
  Number(value || 0).toFixed(digits)

function NutrientBar({ label, value, target, unit, color, incomplete }) {
  const { t: auditText } = useTranslation()
  const validTarget = Number(target) > 0
  const percentage = validTarget && !incomplete
    ? Math.min(100, (Number(value) / Number(target)) * 100)
    : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[#593849]">
          {label}
        </span>
        <span className="text-xs text-[#8C7280]">
          {incomplete ? auditText('common:partial_data') : ''}
          {format(value)}
          {validTarget && !incomplete
            ? ` / ${format(target)}`
            : ''}
          {' '}{unit}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-[#F4E7E9]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  )
}

export default function NutritionToday({ data, onAddMeal }) {
  const { t: auditText } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const totals = data?.totals || {}
  const targets = data?.targets || {}
  const incomplete = Number(data?.unverified_meals || 0) > 0
  const hasTarget = Number(targets.calories) > 0 && !incomplete

  const percentage = hasTarget
    ? Math.min(
        100,
        (Number(totals.calories || 0) /
          Number(targets.calories)) * 100
      )
    : 0

  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl border border-[#F3DFE5] bg-white p-6 shadow-sm">
          <h3 className="mb-6 font-['Playfair_Display'] text-xl font-semibold text-[#7B2346]">
            {uiText('today_s_nutrition')}
          </h3>

          {incomplete && (
            <p className="mb-5 rounded-xl bg-[#FFF6F1] p-4 text-xs leading-6 text-[#795C69]">
              {data.unverified_meals} {auditText('common:logged_food_item_s_do_not_have_verified_nutrient_data_the_values_below_are_incomplete_and_should_not_be_treated_as_your_total_daily_intake')}
            </p>
          )}

          <div className="grid gap-7 md:grid-cols-[180px_1fr]">
            <div className="flex flex-col items-center justify-center">
              <div
                className="flex h-40 w-40 items-center justify-center rounded-full p-3"
                style={{
                  background: hasTarget
                    ? `conic-gradient(#7B2346 ${percentage}%, #F6D3DB 0)`
                    : '#F6D3DB',
                }}
              >
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white">
                  <Flame size={22} className="mb-2 text-[#D9A25B]" />
                  <p className="text-2xl font-bold text-[#3A1224]">
                    {Math.round(totals.calories || 0)}
                  </p>
                  <p className="text-center text-xs text-[#947684]">
                    {hasTarget
                      ? `/ ${Math.round(targets.calories)} kcal`
                      : auditText('common:verified_kcal_logged')}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-center text-xs text-[#947684]">
                {hasTarget
                  ? auditText('common:compared_with_reviewed_target')
                  : auditText('common:no_complete_reviewed_target_comparison')}
              </p>
            </div>

            <div className="space-y-5">
              {[
                ['Protein', 'protein', 'g', '#D9A25B'],
                ['Iron', 'iron', 'mg', '#C96A81'],
                ['Calcium', 'calcium', 'mg', '#A77AC4'],
              ].map(([label, key, unit, color]) => (
                <NutrientBar
                  key={key}
                  label={label}
                  value={totals[key]}
                  target={targets[key]}
                  unit={unit}
                  color={color}
                  incomplete={incomplete}
                />
              ))}

              <NutrientBar
                label={auditText('common:water')}
                value={data?.water_glasses}
                target={null}
                unit="glasses"
                color="#73A9CF"
                incomplete={false}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-3xl bg-gradient-to-br from-[#FCE7DF] via-[#FFF6F1] to-[#F6D3DB] p-7">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80">
            <Heart size={32} className="text-[#7B2346]" />
          </div>
          <h3 className="font-['Playfair_Display'] text-2xl font-semibold text-[#7B2346]">
            {auditText('common:nourish_your_recovery')}
          </h3>
          <p className="mt-3 text-sm leading-7 text-[#795C69]">
            {auditText('common:explore_familiar_sri_lankan_foods_record_your_meals_and_support_your_recovery_with_varied_nutrition')}
          </p>
          <div className="mt-6 flex items-center gap-2 text-xs text-[#7B2346]">
            <Milk size={17} />
            Nutrition education, not medical advice
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[#F3DFE5] bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-['Playfair_Display'] text-xl font-semibold text-[#7B2346]">
            {auditText('common:today_s_meals')}
          </h3>
          <button
            type="button"
            onClick={onAddMeal}
            className="rounded-full bg-[#7B2346] px-5 py-2.5 text-xs font-semibold text-white"
          >
            {auditText('common:add_meal')}
          </button>
        </div>

        {data?.meals?.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {data.meals.slice(0, 6).map((meal) => (
              <div
                key={meal.id}
                className="rounded-2xl bg-[#FFF6F1] p-4"
              >
                <p className="text-xs font-semibold uppercase text-[#B48A9A]">
                  {meal.meal_type.replaceAll('_', ' ')}
                </p>
                <p className="mt-2 font-semibold text-[#7B2346]">
                  {meal.food_name}
                </p>
                <p className="mt-2 text-xs text-[#8A6D79]">
                  {meal.grams} g
                </p>
                <p className="mt-1 text-xs text-[#8A6D79]">
                  {meal.verified && meal.nutrients
                    ? `${meal.nutrients.calories} kcal`
                    : auditText('common:nutrient_data_unavailable')}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-[#FFF6F1] p-6 text-sm text-[#977A86]">
            {auditText('common:no_meals_logged_today')}
          </p>
        )}
      </div>
    </div>
  )
}
