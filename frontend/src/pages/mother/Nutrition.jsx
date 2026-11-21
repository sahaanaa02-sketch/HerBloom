import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useState } from 'react'
import {
  Camera,
  RefreshCw,
  AlertCircle,
  Utensils,
  BookHeart,
} from 'lucide-react'

import MotherLayout from '../../components/mother/MotherLayout'

import NutritionToday from '../../components/nutrition/NutritionToday'
import DailyFoodLog from '../../components/nutrition/DailyFoodLog'
import MealScanner from '../../components/nutrition/MealScanner'
import WeeklyMealPlan from '../../components/nutrition/WeeklyMealPlan'
import HydrationCard from '../../components/nutrition/HydrationCard'
import AnaemiaCard from '../../components/nutrition/AnaemiaCard'
import GdmNutritionCard from '../../components/nutrition/GdmNutritionCard'
import MealIdeas from '../../components/nutrition/MealIdeas'

import { nutritionApi } from '../../services/nutritionApi'


const TABS = [
  { id: 'today', label: 'common:today' },
  { id: 'food', label: 'common:food_log' },
  { id: 'plan', label: 'common:meal_plan' },
  { id: 'anaemia', label: 'common:anaemia_care' },
  { id: 'gdm', label: 'common:gdm_follow_up' },
]


export default function Nutrition({
  user,
  onLogout,
  onNavigate,
}) {
  const { t: auditText } = useTranslation()
  const { t: localizeCopy } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const token = user?.access_token

  const [tab, setTab] = useState('today')
  const [scannerOpen, setScannerOpen] = useState(false)

  const [todayData, setTodayData] = useState(null)
  const [plan, setPlan] = useState(null)
  const [anaemia, setAnaemia] = useState(null)
  const [gdm, setGdm] = useState(null)
  const [ideas, setIdeas] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    if (!token) return

    const results = await Promise.allSettled([
      nutritionApi.today(token),
      nutritionApi.mealPlan(token),
      nutritionApi.anaemia(token),
      nutritionApi.gdm(token),
      nutritionApi.ideas(token),
    ])

    const [
      todayResult,
      planResult,
      anaemiaResult,
      gdmResult,
      ideasResult,
    ] = results

    if (todayResult.status === 'fulfilled') {
      setTodayData(todayResult.value)
    }

    if (planResult.status === 'fulfilled') {
      setPlan(planResult.value)
    }

    if (anaemiaResult.status === 'fulfilled') {
      setAnaemia(anaemiaResult.value)
    }

    if (gdmResult.status === 'fulfilled') {
      setGdm(gdmResult.value)
    }

    if (ideasResult.status === 'fulfilled') {
      setIdeas(ideasResult.value)
    }

    const failures = results.filter(
      (result) => result.status === 'rejected'
    )

    if (failures.length) {
      setError(
        failures[0].reason?.message ||
        "common:some_nutrition_information_could_not_be_loaded"
      )
    } else {
      setError('')
    }
  }, [token])

  useEffect(() => {
    let active = true

    async function initialLoad() {
      setLoading(true)

      try {
        await loadData()
      } finally {
        if (active) setLoading(false)
      }
    }

    initialLoad()

    return () => {
      active = false
    }
  }, [loadData])

  async function refresh() {
    setRefreshing(true)

    try {
      await loadData()
    } finally {
      setRefreshing(false)
    }
  }

  function openFoodLog() {
    setTab('food')
  }

  return (
    <MotherLayout
      user={user}
      activePage="nutrition"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      <div className="space-y-7">
        {/* PAGE HEADING */}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#D9A25B]">
              {auditText('common:herbloom_nourishment')}
            </p>

            <h1 className="font-['Playfair_Display'] text-3xl font-semibold text-[#7B2346] md:text-4xl">
              {uiText('nutrition_and_anaemia')}
            </h1>

            <p className="mt-2 text-sm text-[#947684]">
              {auditText('common:fuel_well_boost_your_nutrients_and_recover_better')}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-full border border-[#E8CBD5] bg-white px-4 py-3 text-sm text-[#7B2346] disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={refreshing ? 'animate-spin' : ''}
              />
              {uiText('refresh')}
            </button>

            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="flex items-center gap-2 rounded-full bg-[#7B2346] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#5F1937]"
            >
              <Camera size={17} />
              {uiText('scan_food')}
            </button>
          </div>
        </div>

        {/* TABS */}

        <div className="flex flex-wrap gap-2.5">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`min-h-11 rounded-full px-4 py-2.5 text-xs font-semibold sm:px-5 transition ${
                tab === item.id
                  ? 'bg-[#7B2346] text-white shadow-md'
                  : 'bg-[#F6D3DB]/65 text-[#7B2346] hover:bg-[#F6D3DB]'
              }`}
            >
              {localizeCopy(item.label)}
            </button>
          ))}
        </div>

        {/* ERROR */}

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle size={19} className="shrink-0" />
            <span>{error.startsWith('common:') ? auditText(error) : error}</span>
          </div>
        )}

        {/* CONTENT */}

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#F6D3DB] border-t-[#7B2346]" />

              <p className="text-sm text-[#7B2346]">
                {localizeCopy('common:loading_your_nutrition_information')}
              </p>
            </div>
          </div>
        ) : (
          <>
            {tab === 'today' && (
              <div className="space-y-6">
                <NutritionToday
                  data={todayData}
                  onAddMeal={openFoodLog}
                />

                <div className="grid gap-6 xl:grid-cols-2">
                  <HydrationCard
                    token={token}
                    glasses={todayData?.water_glasses || 0}
                    onRefresh={refresh}
                  />

                  <div className="rounded-3xl bg-gradient-to-br from-[#7B2346] to-[#A94C6B] p-5 text-white sm:p-7">
                    <Utensils size={28} className="mb-5 text-[#F5C4D2]" />

                    <h3 className="font-['Playfair_Display'] text-2xl">
                      {uiText('your_food_journal')}
                    </h3>

                    <p className="mt-3 text-sm leading-7 text-white/80">
                      {auditText('common:record_meals_explore_sri_lankan_food_ideas_and_keep_your_nutrition_journey_organized')}
                    </p>

                    <button
                      type="button"
                      onClick={openFoodLog}
                      className="mt-6 rounded-full bg-white px-5 py-3 text-xs font-semibold text-[#7B2346]"
                    >
                      {auditText('common:open_food_log')}
                    </button>
                  </div>
                </div>

                <MealIdeas ideas={ideas} />
              </div>
            )}

            {tab === 'food' && (
              <DailyFoodLog
                token={token}
                data={todayData}
                onRefresh={refresh}
              />
            )}

            {tab === 'plan' && (
              <WeeklyMealPlan
                token={token}
                plan={plan}
                onRefresh={refresh}
              />
            )}

            {tab === 'anaemia' && (
              <AnaemiaCard
                token={token}
                data={anaemia}
                onRefresh={refresh}
              />
            )}

            {tab === 'gdm' && (
              <GdmNutritionCard data={gdm} />
            )}
          </>
        )}

        {/* DISCLAIMER */}

        <div className="flex items-start gap-3 rounded-2xl border border-[#EBD5DD] bg-white/70 p-5">
          <BookHeart
            size={20}
            className="mt-0.5 shrink-0 text-[#7B2346]"
          />

          <p className="text-xs leading-6 text-[#977A86]">
            HerBloom provides educational information only.
            Food recognition and nutrient estimates may be
            inaccurate. This application does not diagnose
            anaemia, diabetes or nutritional deficiencies.
            Please consult a qualified healthcare professional
            for individualized medical or dietary advice.
          </p>
        </div>
      </div>

      {/* SCANNER MODAL */}

      {scannerOpen && (
        <MealScanner
          token={token}
          onViewPlan={() => { setScannerOpen(false); onNavigate?.('settings-plan') }}
          onClose={() => setScannerOpen(false)}
          onSaved={refresh}
        />
      )}
    </MotherLayout>
  )
}