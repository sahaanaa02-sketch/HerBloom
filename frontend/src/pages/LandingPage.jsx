import { useTranslation } from 'react-i18next'
import './LandingPage.css'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { publishedFaqs } from '../services/supportApi'
import PublicLegal from '../components/PublicLegal'

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Mail,
  Menu,
  Target,
  Star,
  X,
} from 'lucide-react'

import logo from '../assets/logo.png'
import heroImage from '../assets/landing-hero.jpg'
import aboutImage from '../assets/landing-about.jpg'
import { Botanical, JourneyIllustration } from './LandingArtwork'


const year = new Date().getFullYear()



const steps = [
  {
    number: '01',
    title: 'create_your_space',
    description:
      'sign_up_and_share_a_few_details_about_your_recovery_journey',
  },
  {
    number: '02',
    title: 'track_your_recovery',
    description:
      'monitor_your_physical_recovery_mood_rest_and_daily_wellbeing',
  },
  {
    number: '03',
    title: 'nourish_learn',
    description:
      'explore_mother_friendly_nutrition_tips_care_guides_and_remin',
  },
  {
    number: '04',
    title: 'get_guided_support',
    description:
      'ask_questions_and_find_helpful_educational_information_with_',
  },
]

const faqs = [
  {
    question: 'what_is_herbloom',
    answer:
      'herbloom_is_a_postpartum_recovery_companion_offering_recover',
  },
  {
    question: 'is_it_only_for_c_section_mothers',
    answer:
      'no_herbloom_is_designed_for_mothers_recovering_from_both_vag',
  },
  {
    question: 'do_i_need_an_account_to_explore',
    answer:
      'an_account_is_needed_for_personal_tracking_a_guest_experienc',
  },
  {
    question: 'is_my_information_kept_private',
    answer:
      'herbloom_is_designed_with_privacy_in_mind_appropriate_securi',
  },
  {
    question: 'can_i_use_it_in_tamil',
    answer:
      'herbloom_is_being_developed_with_english_and_tamil_support',
  },
  {
    question: 'does_it_replace_medical_advice',
    answer:
      'no_herbloom_is_an_educational_companion_not_a_medical_diagno',
  },
]

export default function LandingPage({
  onLogin,
  onGetStarted,
}) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFAQ, setOpenFAQ] = useState(null)
  const { t, i18n } = useTranslation('landing')
  const faqLanguage = i18n.resolvedLanguage
  const [managedFaqs, setManagedFaqs] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    publishedFaqs(faqLanguage, controller.signal).then((result) => {
      if (!controller.signal.aborted) setManagedFaqs(result.available ? { language: faqLanguage, items: result.items } : null)
    }).catch(() => {})
    return () => controller.abort()
  }, [faqLanguage])


  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 30)
    }

    handleScroll()

    window.addEventListener('scroll', handleScroll, {
      passive: true,
    })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const goTo = (id) => {
    setMenuOpen(false)

    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  const navLinks = [
    { name: 'how_it_works', id: 'how-it-works' },
    { name: 'about', id: 'about' },
    { name: 'faq', id: 'faq' },
  ]

  const entries = managedFaqs?.language === faqLanguage && managedFaqs.items.length
    ? managedFaqs.items : faqs

  return (
    <div className="hb-landing">
      <header className={`hb-navbar ${scrolled ? 'hb-navbar-scrolled' : ''}`}>
        <div className="hb-nav-inner">
          <a href="#home" onClick={(event) => { event.preventDefault(); goTo('home') }}>
            <img className="hb-logo" src={logo} width={923} height={623} alt="HerBloom" />
          </a>
          <nav className="hb-nav-links">
            {navLinks.map(link => <a key={link.id} href={`#${link.id}`}>{t(link.name)}</a>)}
          </nav>
          <div className="hb-nav-actions">
            <LanguageSwitcher />
            <button type="button" className="hb-login" onClick={onLogin}>{t('log_in')}</button>
            <button type="button" className="hb-btn" onClick={onGetStarted}>{t('start_your_journey')} <ArrowRight size={17} /></button>
          </div>
          <button type="button" className="hb-mobile-menu" aria-label={t('toggle_navigation')}
            aria-expanded={menuOpen} aria-controls="hb-mobile-navigation"
            onClick={() => setMenuOpen(open => !open)}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {menuOpen && <nav id="hb-mobile-navigation" className="hb-mobile-nav">
          <LanguageSwitcher />
          {navLinks.map(link => <a key={link.id} href={`#${link.id}`} onClick={() => setMenuOpen(false)}>{t(link.name)}</a>)}
          <button type="button" className="hb-login" onClick={onLogin}>{t('log_in')}</button>
          <button type="button" className="hb-btn" onClick={onGetStarted}>{t('start_your_journey')} <ArrowRight size={17} /></button>
        </nav>}
      </header>

      <main>
        <section id="home" className="hb-hero">
          <img src={heroImage} width={1612} height={656} className="hb-hero-photo" alt={t('mother_holding_her_newborn_baby')} fetchPriority="high" />
          <div className="hb-hero-wash" aria-hidden="true" />
          <Botanical className="hb-hero-botanical" />
          <div className="hb-container hb-hero-content">
            <p className="hb-label">{t('for_sri_lankan_tamil_mothers')}</p>
            <h1>HerBloom</h1>
            <p className="hb-hero-tagline">{t('recover_feel_better_bloom_again')}</p>
            <p className="hb-hero-subtitle">{t('a_little_care_every_day')}</p>
            <button type="button" className="hb-btn" onClick={onGetStarted}>{t('start_my_journey')} <ArrowRight size={19} /></button>
          </div>
        </section>

        <section id="problem-solution" className="hb-problem hb-container">
          <div className="hb-problem-pill">
            <h2>{t('the_challenge')}</h2>
            <p>{t('after_childbirth_mothers_often_face_physical_discomfort_emot')}</p>
          </div>
          <ArrowRight className="hb-problem-arrow" aria-hidden="true" />
          <div className="hb-problem-pill hb-solution">
            <h2>{t('our_solution')}</h2>
            <p>{t('herbloom_brings_recovery_education_emotional_wellbeing_suppo')}</p>
          </div>
        </section>

        <section id="how-it-works" className="hb-container hb-how">
          <div className="hb-how-heading">
            <p className="hb-label">{t('how_it_works_19')}</p>
            <h2>{t('support_at')} {t('every_step')}</h2>
            <p>{t('a_simple_guided_journey_with_helpful_tools_for_a_more_inform')}</p>
          </div>
          <ol className="hb-steps">
            {steps.map(({ number, title, description }) => <li key={number}>
              <span className="hb-step-icon" aria-hidden="true"><JourneyIllustration step={number} /></span>
              <div className="hb-step-copy">
                <span className="hb-step-number">{number}</span>
                <h3>{t(title)}</h3>
                <p>{t(description)}</p>
              </div>
            </li>)}
          </ol>
        </section>

        <section id="about" className="hb-container hb-about">
          <div className="hb-about-art">
            <img src={aboutImage} width={1264} height={843} loading="lazy" decoding="async"
              alt={t('mother_and_newborn')} className="hb-about-photo" />
            <Botanical className="hb-about-botanical" />
          </div>
          <div className="hb-about-intro">
            <p className="hb-label">{t('about_herbloom')}</p>
            <h2>{t('caring_for_mothers')}<br />{t('beyond_birth')}</h2>
            <p>{t('herbloom_is_a_postpartum_recovery_companion_designed_to_make')}</p>
          </div>
          <div className="hb-about-detail">
            <Target aria-hidden="true" />
            <div><h3>{t('our_mission')}</h3><p>{t('to_help_mothers_feel_informed_supported_and_respected_throug')}</p></div>
          </div>
          <div className="hb-about-detail">
            <Star aria-hidden="true" />
            <div>
              <h3>{t('what_makes_us_different')}</h3>
              <ul>
                {['designed_with_sri_lankan_mothers_in_mind', 'english_and_tamil_support_planned', 'recovery_nutrition_and_wellbeing_in_one_place'].map(key => <li key={key}><Check aria-hidden="true" />{t(key)}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section id="faq" className="hb-container hb-faq">
          <div className="hb-faq-heading">
            <Botanical className="hb-faq-botanical" />
            <p className="hb-label">{t('faq')}</p>
            <h2>{t('common')} {t('questions')}</h2>
            <p>{t('quick_answers_to_help_you_get_started')}</p>
          </div>
          <div className="hb-faq-grid">
            {entries.map((faq, index) => {
              const key = faq.id ?? faq.question
              const isOpen = openFAQ === key
              const id = `hb-faq-answer-${index}`
              return <div className="hb-faq-item" key={key}>
                <button type="button" className="hb-faq-question" aria-expanded={isOpen} aria-controls={id}
                  onClick={() => setOpenFAQ(isOpen ? null : key)}>
                  <span>{faq.id == null ? t(faq.question) : faq.question}</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
                <div className="hb-faq-answer" id={id} inert={isOpen ? undefined : true} aria-hidden={!isOpen}>
                  <div><p>{faq.id == null ? t(faq.answer) : faq.answer}</p></div>
                </div>
              </div>
            })}
          </div>
        </section>

        <section className="hb-cta-section">
          <div className="hb-container hb-cta">
            <Botanical className="hb-cta-botanical" />
            <Botanical className="hb-cta-botanical hb-cta-botanical-start" />
            <h2>{t('you_care_for_everyone')}<br />{t('let_s_make_space_for_you')}</h2>
            <p>{t('a_caring_all_in_one_companion_for_your_postpartum_recovery_j')}</p>
            <button type="button" className="hb-btn hb-btn-light" onClick={onGetStarted}>{t('start_my_journey')} <ArrowRight size={17} /></button>
          </div>
        </section>
      </main>

      <footer className="hb-footer">
        <div className="hb-container hb-footer-grid">
          <div>
            <img src={logo} width={923} height={623} alt="HerBloom" className="hb-logo" />
            <p>{t('recover_feel_better_bloom_again')}</p>
          </div>
          <nav className="hb-footer-links">
            {navLinks.map(link => <a key={link.id} href={`#${link.id}`}>{t(link.name)}</a>)}
          </nav>
          <div>
            <h3><Mail size={15} aria-hidden="true" />{t('contact')}</h3>
            <p>{t('contact_email_coming_soon')}</p>
            <p>{t('social_media_links_will_be_added_when_official_accounts_are_')}</p>
          </div>
          <div>
            <PublicLegal landing />
            <p>{t('built_with_care_for_mothers')} · © {year} HerBloom. {t('all_rights_reserved')}</p>
          </div>
        </div>
        <p className="hb-container hb-footer-note">{t('herbloom_provides_educational_information_and_does_not_repla')}</p>
      </footer>
    </div>
  )
}
