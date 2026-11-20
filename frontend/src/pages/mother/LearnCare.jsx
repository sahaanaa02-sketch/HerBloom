import { useEffect, useMemo, useState } from 'react'

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Languages,
  MessageCircle,
  Search,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react'

import MotherLayout from '../../components/mother/MotherLayout'

import {
  getArticles,
  getArticle,
  getArticlesForWeek,
} from '../../services/articleApi'


const CATEGORIES = [
  ['all', 'All'],
  ['breastfeeding', 'Breastfeeding'],
  ['baby_care', 'Baby Care'],
  ['recovery', 'Recovery Care'],
  ['traditional', 'Traditional Care'],
  ['pelvic', 'Pelvic & Bladder'],
  ['cycle', 'Cycle'],
  ['faq', 'FAQs'],
]


const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1491013516836-7db643ee125a?w=1000&auto=format&fit=crop&q=80'


const SAFETY = {
  helpful: {
    en: 'Helpful information',
    ta: 'பயனுள்ள தகவல்',
    style: 'bg-green-50 text-green-700',
  },

  use_with_care: {
    en: 'Use with care',
    ta: 'கவனத்துடன் பயன்படுத்தவும்',
    style: 'bg-amber-50 text-amber-700',
  },

  not_recommended: {
    en: 'Not recommended',
    ta: 'பரிந்துரைக்கப்படவில்லை',
    style: 'bg-red-50 text-red-700',
  },
}


function textOf(article, key, language) {
  return (
    article?.[`${key}_${language}`] ||
    article?.[`${key}_en`] ||
    ''
  )
}


/* ------------------------------------
   IMAGE WITH FALLBACK
------------------------------------ */

function ImageWithFallback({
  src,
  alt,
  className = '',
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  return (
    <div
      className={`
        relative overflow-hidden
        bg-gradient-to-br
        from-[#F6D3DB]
        via-[#FFF6F1]
        to-[#E8D5B6]
        ${className}
      `}
    >
      {!failed && (
        <img
          src={src || FALLBACK_IMAGE}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}

      {failed && (
        <div
          className="
            flex h-full w-full
            items-center justify-center
            text-[#7B2346]/40
          "
        >
          <BookOpen size={42} />
        </div>
      )}
    </div>
  )
}


/* ------------------------------------
   SAFETY BADGE
------------------------------------ */

function SafetyBadge({ value, language }) {
  const info = SAFETY[value]

  if (!info) return null

  return (
    <span
      className={`
        inline-flex rounded-full
        px-3 py-1 text-xs font-semibold
        ${info.style}
      `}
    >
      {info[language]}
    </span>
  )
}


/* ------------------------------------
   MEDICAL DISCLAIMER
------------------------------------ */

function MedicalDisclaimer({
  language,
  compact = false,
}) {
  const isTamil = language === 'ta'

  return (
    <section
      role="note"
      aria-label="Medical disclaimer"
      className={`
        rounded-2xl
        border border-[#E9C9D5]
        bg-[#FFF1F5]
        ${compact ? 'p-4' : 'mb-7 p-5 md:p-6'}
      `}
    >
      <div className="flex items-start gap-3">
        <span
          className="
            flex h-10 w-10 shrink-0
            items-center justify-center
            rounded-xl bg-[#F6D3DB]
            text-[#7B2346]
          "
        >
          <ShieldAlert size={21} />
        </span>

        <div>
          <h2 className="font-semibold text-[#7B2346]">
            {isTamil
              ? 'முக்கிய மருத்துவ அறிவிப்பு'
              : 'Important Health Disclaimer'}
          </h2>

          <p className="mt-2 text-sm leading-7 text-[#765363]">
            {isTamil
              ? 'HerBloom கட்டுரைகள் பொதுவான கல்வி மற்றும் விழிப்புணர்வுக்காக மட்டுமே வழங்கப்படுகின்றன. இவை மருத்துவ நிபுணர்களால் மதிப்பாய்வு செய்யப்படவில்லை. மருத்துவ ஆலோசனை, நோயறிதல் அல்லது சிகிச்சைக்கு மாற்றாக இவற்றைப் பயன்படுத்த வேண்டாம். ஒவ்வொரு தாயும் குழந்தையும் வேறுபட்டவர்கள். பாரம்பரிய மூலிகைகள் ஒவ்வாமை அல்லது தோல் எரிச்சலை ஏற்படுத்தலாம். குறிப்பாக புதிதாகப் பிறந்த குழந்தைகள் மற்றும் C-section காயங்கள் தொடர்பாக எந்தவொரு பராமரிப்பு முறையையும் பின்பற்றுவதற்கு முன் தகுதியான சுகாதார நிபுணரிடம் ஆலோசனை பெறுங்கள். தீவிரமான எச்சரிக்கை அறிகுறிகள் இருந்தால் உடனடியாக மருத்துவ உதவி பெறுங்கள்.'
              : 'HerBloom articles are provided for general education and awareness only. They have not been medically reviewed and do not replace professional medical advice, diagnosis, or treatment. Every mother and baby is different. Traditional herbs may cause allergies or skin irritation. Consult a qualified healthcare professional before trying care practices, especially for newborns or C-section wounds. Seek urgent medical care for serious warning signs.'}
          </p>

          <p
            className="
              mt-3 text-xs font-semibold
              text-[#7B2346]
            "
          >
            {isTamil
              ? 'கல்வித் தகவல் · மருத்துவ மதிப்பாய்வு செய்யப்படவில்லை'
              : 'Educational content · Not medically reviewed'}
          </p>
        </div>
      </div>
    </section>
  )
}


/* ------------------------------------
   ARTICLE CARD
------------------------------------ */

function ArticleCard({
  article,
  language,
  onOpen,
  compact = false,
}) {
  const title = textOf(
    article,
    'title',
    language
  )

  return (
    <button
      type="button"
      onClick={() => onOpen(article.id)}
      className="
        group overflow-hidden
        rounded-[22px]
        border border-[#F0DEE4]
        bg-white text-left
        shadow-[0_6px_18px_rgba(123,35,70,0.07)]
        transition
        hover:-translate-y-1
        hover:shadow-[0_12px_28px_rgba(123,35,70,0.13)]
      "
    >
      <ImageWithFallback
        src={article.image_url}
        alt={title}
        className={
          compact
            ? 'h-32 w-full'
            : 'h-44 w-full'
        }
      />

      <div className="space-y-3 p-4">
        <p
          className="
            line-clamp-2 min-h-[42px]
            text-sm font-bold leading-6
            text-[#4D2435]
          "
        >
          {title}
        </p>

        <SafetyBadge
          value={article.safety_label}
          language={language}
        />

        <div
          className="
            flex items-center justify-between
          "
        >
          <span
            className="
              flex items-center gap-1.5
              text-xs text-[#9B7787]
            "
          >
            <Clock3 size={13} />

            {article.read_time}
            {language === 'ta'
              ? ' நிமிட வாசிப்பு'
              : ' min read'}
          </span>

          <span
            className="
              rounded-full bg-[#FFF1F5]
              p-2 text-[#7B2346]
              transition
              group-hover:bg-[#7B2346]
              group-hover:text-white
            "
          >
            <ArrowRight size={15} />
          </span>
        </div>
      </div>
    </button>
  )
}


/* ------------------------------------
   ARTICLE DETAIL PAGE
------------------------------------ */

function ArticlePage({
  article,
  language,
  onBack,
  onAsk,
}) {
  const title = textOf(
    article,
    'title',
    language
  )

  const body = textOf(
    article,
    'body',
    language
  )

  const points = textOf(
    article,
    'key_points',
    language
  )

  const doctorNote = textOf(
    article,
    'doctor_note',
    language
  )

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <button
        type="button"
        onClick={onBack}
        className="
          mb-6 inline-flex
          items-center gap-2
          text-sm font-semibold
          text-[#7B2346]
        "
      >
        <ArrowLeft size={18} />

        {language === 'ta'
          ? 'கட்டுரைகளுக்குத் திரும்பு'
          : 'Back to articles'}
      </button>

      <article
        className="
          overflow-hidden
          rounded-[28px]
          border border-[#F0DEE4]
          bg-white shadow-sm
        "
      >
        <ImageWithFallback
          src={article.image_url}
          alt={title}
          className="h-56 w-full md:h-80"
        />

        <div className="space-y-8 p-6 md:p-10">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="
                  rounded-full bg-[#FFF0F4]
                  px-3 py-1
                  text-xs font-semibold
                  text-[#7B2346]
                "
              >
                {
                  CATEGORIES.find(
                    c => c[0] === article.category
                  )?.[1]
                }
              </span>

              <SafetyBadge
                value={article.safety_label}
                language={language}
              />
            </div>

            <h1
              className="
                font-['Playfair_Display']
                text-3xl font-semibold
                leading-tight text-[#7B2346]
                md:text-4xl
              "
            >
              {title}
            </h1>

            <div
              className="
                flex flex-wrap gap-4
                text-xs text-[#987887]
              "
            >
              <span className="flex items-center gap-1.5">
                <Clock3 size={15} />

                {article.read_time} min read
              </span>

              <span className="flex items-center gap-1.5">
                <CalendarDays size={15} />

                {article.review_date ||
                  (language === 'ta'
                    ? 'மதிப்பாய்வு நிலுவையில் உள்ளது'
                    : 'Review pending')}
              </span>
            </div>

            <p className="text-sm text-[#8B6777]">
              {article.reviewed_by
                ? language === 'ta'
                  ? `மதிப்பாய்வு செய்தவர்: ${article.reviewed_by}`
                  : `Reviewed by ${article.reviewed_by}`
                : language === 'ta'
                  ? 'மருத்துவ மதிப்பாய்வு செய்யப்படவில்லை'
                  : 'Not medically reviewed'}
            </p>
          </div>

          {/* Disclaimer on every article page */}
          <MedicalDisclaimer
            language={language}
            compact
          />

          {/* Key points */}
          {Array.isArray(points) &&
            points.length > 0 && (
              <section
                className="
                  rounded-2xl
                  bg-[#FFF6F1] p-6
                "
              >
                <h2
                  className="
                    mb-4 flex items-center
                    gap-2 text-lg font-bold
                    text-[#7B2346]
                  "
                >
                  <Sparkles size={19} />

                  {language === 'ta'
                    ? 'முக்கிய குறிப்புகள்'
                    : 'Key Points'}
                </h2>

                <div className="space-y-3">
                  {points.map((point, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3"
                    >
                      <CheckCircle2
                        size={18}
                        className="
                          mt-1 shrink-0
                          text-[#7B2346]
                        "
                      />

                      <p
                        className="
                          text-sm leading-7
                          text-[#674A57]
                        "
                      >
                        {point}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

          {/* Article body */}
          <section className="space-y-5">
            {body
              .split(/\n\s*\n/)
              .filter(Boolean)
              .map((paragraph, index) => (
                <p
                  key={index}
                  className="
                    whitespace-pre-line
                    text-[15px] leading-8
                    text-[#654B56]
                  "
                >
                  {paragraph}
                </p>
              ))}
          </section>

          {/* Doctor note */}
          {doctorNote && (
            <section
              className="
                rounded-2xl
                border border-amber-200
                bg-amber-50 p-6
              "
            >
              <h2
                className="
                  mb-3 flex items-center
                  gap-2 text-lg font-bold
                  text-amber-900
                "
              >
                <Stethoscope size={21} />

                {language === 'ta'
                  ? 'எப்போது மருத்துவரை அணுக வேண்டும்?'
                  : 'When to See a Doctor'}
              </h2>

              <p
                className="
                  whitespace-pre-line
                  text-sm leading-8
                  text-amber-900
                "
              >
                {doctorNote}
              </p>
            </section>
          )}

          {/* AI assistant */}
          <div
            className="
              rounded-2xl
              border border-[#EED8E0]
              bg-[#FFFBFC] p-5
            "
          >
            <p
              className="
                mb-4 text-sm leading-6
                text-[#8C6C7B]
              "
            >
              {language === 'ta'
                ? 'இந்தக் கட்டுரையைப் பற்றி மேலும் கேட்க விரும்புகிறீர்களா?'
                : 'Have questions about this topic?'}
            </p>

            <button
              type="button"
              onClick={() => onAsk(article.id)}
              className="
                inline-flex items-center
                gap-2 rounded-full
                bg-[#7B2346]
                px-6 py-3
                text-sm font-semibold
                text-white transition
                hover:bg-[#5D1834]
              "
            >
              <MessageCircle size={18} />

              {language === 'ta'
                ? 'HerBloom-இடம் கேளுங்கள்'
                : 'Ask HerBloom About This'}
            </button>
          </div>
        </div>
      </article>
    </div>
  )
}


/* ------------------------------------
   MAIN LEARN AND CARE PAGE
------------------------------------ */

export default function LearnCare({
  user,
  onLogout,
  onNavigate,
  onAskArticle,
}) {
  const token = user?.access_token

  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState('en')

  const [articles, setArticles] = useState([])
  const [weekly, setWeekly] = useState([])

  const [selected, setSelected] = useState(null)

  const [loading, setLoading] = useState(true)
  const [articleLoading, setArticleLoading] =
    useState(false)

  const [error, setError] = useState('')
  const [page, setPage] = useState(0)

  /* Fetch articles */
  useEffect(() => {
    let active = true

    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')

      try {
        const [list, recommended] =
          await Promise.all([
            getArticles(token, {
              category,
              search,
            }),
            getArticlesForWeek(token),
          ])

        if (active) {
          setArticles(list.items || [])
          setWeekly(recommended || [])
          setPage(0)
        }
      } catch (err) {
        if (active) {
          setError(
            err.message ||
            'Failed to load articles.'
          )
          setArticles([])
          setWeekly([])
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }, 250)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [token, category, search])


  /* Open individual article */
  async function openArticle(id) {
    setArticleLoading(true)
    setError('')

    try {
      const article = await getArticle(token, id)

      setSelected(article)

      window.scrollTo?.({
        top: 0,
        behavior: 'smooth',
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setArticleLoading(false)
    }
  }


  /* Ask HerBloom */
  function askArticle(id) {
    if (onAskArticle) {
      onAskArticle(id)
    } else {
      setError(
        'Ask HerBloom page is not connected yet.'
      )
    }
  }


  /* Pagination */
  const visible = useMemo(() => {
    const start = page * 4

    return articles.slice(
      start,
      start + 4
    )
  }, [articles, page])

  const pages = Math.max(
    1,
    Math.ceil(articles.length / 4)
  )


  return (
    <MotherLayout
      user={user}
      onLogout={onLogout}
      activePage="learn"
      onNavigate={onNavigate}
    >
      <div className="min-h-screen pb-12">

        {!selected && (
          <>
            {/* Page heading */}
            <div
              className="
                mb-7 flex flex-col
                justify-between gap-5
                lg:flex-row lg:items-center
              "
            >
              <div>
                <p
                  className="
                    mb-2 text-xs font-semibold
                    uppercase tracking-[0.2em]
                    text-[#D9A25B]
                  "
                >
                  HERBLOOM LIBRARY
                </p>

                <h1
                  className="
                    font-['Playfair_Display']
                    text-3xl font-bold
                    text-[#7B2346]
                  "
                >
                  Learn & Care
                </h1>

                <p
                  className="
                    mt-2 text-sm
                    text-[#9A7787]
                  "
                >
                  {language === 'ta'
                    ? 'உங்களுக்கும் உங்கள் குழந்தைக்கும் பயனுள்ள கல்வி வழிகாட்டிகள்.'
                    : 'Educational guides for you and your baby.'}
                </p>
              </div>

              {/* Search and language */}
              <div
                className="
                  flex flex-wrap
                  items-center gap-3
                "
              >
                <div
                  className="
                    relative min-w-[220px]
                    flex-1
                  "
                >
                  <Search
                    size={17}
                    className="
                      absolute left-4 top-1/2
                      -translate-y-1/2
                      text-[#A98694]
                    "
                  />

                  <input
                    value={search}
                    onChange={e =>
                      setSearch(e.target.value)
                    }
                    placeholder={
                      language === 'ta'
                        ? 'தலைப்புகளைத் தேடுங்கள்...'
                        : 'Search topics...'
                    }
                    className="
                      w-full rounded-full
                      border border-[#F0DEE4]
                      bg-white py-3
                      pl-11 pr-10
                      text-sm outline-none
                      focus:border-[#7B2346]
                    "
                  />

                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="
                        absolute right-4 top-1/2
                        -translate-y-1/2
                        text-[#987887]
                      "
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setLanguage(
                      v => v === 'en'
                        ? 'ta'
                        : 'en'
                    )
                  }
                  className="
                    flex items-center gap-2
                    rounded-full
                    border border-[#F0DEE4]
                    bg-white px-4 py-3
                    text-sm font-semibold
                    text-[#7B2346]
                  "
                >
                  <Languages size={17} />

                  {language.toUpperCase()}
                </button>
              </div>
            </div>

            {/* Common medical disclaimer */}
            <MedicalDisclaimer language={language} />

            {/* Weekly recommendations */}
            {weekly.length > 0 && (
              <section className="mb-9">
                <div
                  className="
                    mb-4 flex items-center gap-2
                  "
                >
                  <Sparkles
                    size={20}
                    className="text-[#D9A25B]"
                  />

                  <h2
                    className="
                      font-['Playfair_Display']
                      text-xl font-semibold
                      text-[#7B2346]
                    "
                  >
                    {language === 'ta'
                      ? 'உங்கள் வாரத்திற்கான கட்டுரைகள்'
                      : 'For Your Week'}
                  </h2>
                </div>

                <div
                  className="
                    grid gap-4
                    sm:grid-cols-2
                    xl:grid-cols-3
                  "
                >
                  {weekly.slice(0, 3).map(article => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      language={language}
                      onOpen={openArticle}
                      compact
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Categories */}
            <section>
              <div className="mb-5">
                <h2
                  className="
                    mb-4
                    font-['Playfair_Display']
                    text-xl font-semibold
                    text-[#7B2346]
                  "
                >
                  {language === 'ta'
                    ? 'தலைப்புகளை ஆராயுங்கள்'
                    : 'Explore Topics'}
                </h2>

                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setCategory(value)
                      }
                      className={`
                        rounded-full px-4 py-2
                        text-xs font-semibold
                        transition
                        ${
                          category === value
                            ? 'bg-[#7B2346] text-white'
                            : 'bg-[#FBECEF] text-[#6F4155] hover:bg-[#F6D3DB]'
                        }
                      `}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div
                  role="alert"
                  className="
                    mb-5 rounded-xl
                    border border-red-200
                    bg-red-50 p-4
                    text-sm text-red-700
                  "
                >
                  {error}
                </div>
              )}

              {/* Loading */}
              {loading || articleLoading ? (
                <div
                  className="
                    grid gap-5
                    sm:grid-cols-2
                    xl:grid-cols-4
                  "
                >
                  {Array.from({
                    length: 4,
                  }).map((_, index) => (
                    <div
                      key={index}
                      className="
                        h-64 animate-pulse
                        rounded-2xl
                        bg-[#F6E7EC]
                      "
                    />
                  ))}
                </div>
              ) : articles.length === 0 ? (
                /* Empty state */
                <div
                  className="
                    rounded-3xl
                    border border-[#F0DEE4]
                    bg-white px-6 py-16
                    text-center
                  "
                >
                  <BookOpen
                    size={36}
                    className="
                      mx-auto mb-4
                      text-[#B58C9B]
                    "
                  />

                  <h3
                    className="
                      font-semibold
                      text-[#7B2346]
                    "
                  >
                    {language === 'ta'
                      ? 'கட்டுரைகள் கிடைக்கவில்லை'
                      : 'No articles available'}
                  </h3>

                  <p
                    className="
                      mt-2 text-sm
                      text-[#9B7A89]
                    "
                  >
                    {language === 'ta'
                      ? 'வேறு வகை அல்லது தேடல் சொல்லை முயற்சிக்கவும்.'
                      : 'Try another category or search term. Check that articles are published in the database.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Article grid */}
                  <div
                    className="
                      grid gap-5
                      sm:grid-cols-2
                      xl:grid-cols-4
                    "
                  >
                    {visible.map(article => (
                      <ArticleCard
                        key={article.id}
                        article={article}
                        language={language}
                        onOpen={openArticle}
                      />
                    ))}
                  </div>

                  {/* Pagination */}
                  {pages > 1 && (
                    <div
                      className="
                        mt-7 flex items-center
                        justify-center gap-4
                      "
                    >
                      <button
                        type="button"
                        disabled={page === 0}
                        onClick={() =>
                          setPage(p => p - 1)
                        }
                        className="
                          rounded-full
                          bg-white p-2
                          text-[#7B2346]
                          disabled:opacity-30
                        "
                      >
                        <ChevronLeft size={19} />
                      </button>

                      <span
                        className="
                          text-sm text-[#8F7180]
                        "
                      >
                        {page + 1} / {pages}
                      </span>

                      <button
                        type="button"
                        disabled={
                          page >= pages - 1
                        }
                        onClick={() =>
                          setPage(p => p + 1)
                        }
                        className="
                          rounded-full
                          bg-white p-2
                          text-[#7B2346]
                          disabled:opacity-30
                        "
                      >
                        <ChevronRight size={19} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}

        {/* Article detail */}
        {selected && (
          <ArticlePage
            article={selected}
            language={language}
            onBack={() => {
              setSelected(null)
              setError('')
            }}
            onAsk={askArticle}
          />
        )}

        {selected && error && (
          <div
            role="alert"
            className="
              mt-4 rounded-xl
              border border-red-200
              bg-red-50 p-4
              text-sm text-red-700
            "
          >
            {error}
          </div>
        )}
      </div>
    </MotherLayout>
  )
}