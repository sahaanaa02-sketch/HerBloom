import { publishedFaqs } from '../services/supportApi'
import PublicLegal from '../components/PublicLegal'

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Baby,
  Check,
  ChevronDown,
  ClipboardList,
  Heart,
  Languages,
  Mail,
  Menu,
  MessageCircle,
  Sparkles,
  Target,
  Utensils,
  X,
} from 'lucide-react'

import logo from '../assets/logo.png'
import heroImage from '../assets/mother.jpg'
import aboutImage from '../assets/about.png'


const HERO_IMAGE = heroImage
const ABOUT_IMAGE = aboutImage

const steps = [
  {
    number: '01',
    title: 'Create Your Space',
    description:
      'Sign up and share a few details about your recovery journey.',
    icon: Baby,
  },
  {
    number: '02',
    title: 'Track Your Recovery',
    description:
      'Monitor your physical recovery, mood, rest, and daily wellbeing.',
    icon: ClipboardList,
  },
  {
    number: '03',
    title: 'Nourish & Learn',
    description:
      'Explore mother-friendly nutrition tips, care guides, and reminders.',
    icon: Utensils,
  },
  {
    number: '04',
    title: 'Get Guided Support',
    description:
      'Ask questions and find helpful educational information with our AI companion.',
    icon: MessageCircle,
  },
]

const faqs = [
  {
    question: 'What is HerBloom?',
    answer:
      'HerBloom is a postpartum recovery companion offering recovery tracking, wellbeing tools, nutrition education, reminders, and AI-assisted educational support.',
  },
  {
    question: 'Is it only for C-section mothers?',
    answer:
      'No. HerBloom is designed for mothers recovering from both vaginal and C-section deliveries.',
  },
  {
    question: 'Do I need an account to explore?',
    answer:
      'An account is needed for personal tracking. A guest experience for general educational information is planned.',
  },
  {
    question: 'Is my information kept private?',
    answer:
      'HerBloom is designed with privacy in mind. Appropriate security and access controls are important parts of the application.',
  },
  {
    question: 'Can I use it in Tamil?',
    answer:
      'HerBloom is being developed with English and Tamil support.',
  },
  {
    question: 'Does it replace medical advice?',
    answer:
      'No. HerBloom is an educational companion, not a medical diagnosis or treatment service.',
  },
]

export default function LandingPage({
  onLogin,
  onGetStarted,
}) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFAQ, setOpenFAQ] = useState(null)
  const [faqLanguage, setFaqLanguage] = useState('en')
  const [managedFaqs, setManagedFaqs] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    publishedFaqs(faqLanguage, controller.signal).then((result) => {
      if (!controller.signal.aborted) setManagedFaqs(result.available ? result.items : null)
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
      behavior: 'smooth',
      block: 'start',
    })
  }

  const navLinks = [
    { name: 'How It Works', id: 'how-it-works' },
    { name: 'About', id: 'about' },
    { name: 'FAQ', id: 'faq' },
  ]

  return (
    <div className="hb-landing">

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Poppins:wght@400;500;600;700&display=swap');

        .hb-landing {
          --berry: #7B2346;
          --pink: #F6D3DB;
          --gold: #D9A25B;
          --cream: #FFF6F1;
          --burgundy: #7B2346;

          background: var(--cream);
          color: var(--burgundy);
          font-family: 'Poppins', sans-serif;
          overflow-x: hidden;
        }

        .hb-landing *,
        .hb-landing *::before,
        .hb-landing *::after {
          box-sizing: border-box;
        }

        .hb-landing h1,
        .hb-landing h2,
        .hb-landing h3 {
          font-family: 'Playfair Display', serif;
        }

        .hb-landing section,
        .hb-landing [id] {
          scroll-margin-top: 100px;
        }

        .hb-container {
          width: min(1200px, calc(100% - 48px));
          margin-inline: auto;
        }

        .hb-label {
          color: var(--berry);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 2.5px;
          text-transform: uppercase;
        }

        .hb-heading {
          font-size: clamp(36px, 4.2vw, 57px);
          line-height: 1.22;
          font-weight: 600;
          letter-spacing: -1.2px;
        }

        .hb-heading em {
          color: var(--berry);
          font-weight: 400;
        }

        .hb-body {
          font-size: 14px;
          line-height: 2;
          color: #745765;
        }

        .hb-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 15px 28px;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all .25s ease;
        }

        .hb-btn:hover {
          transform: translateY(-2px);
        }

        .hb-btn-primary {
          background: var(--berry);
          color: white;
        }

        .hb-btn-primary:hover {
          background: #7B2346;
          box-shadow: 0 12px 28px #7B23462A;
        }

        .hb-btn-outline {
          background: #FFFFFF99;
          border: 1px solid var(--berry);
          color: var(--berry);
        }

        .hb-btn-outline:hover {
          background: #FBE8ED;
        }

        /* NAVBAR */

        .hb-navbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          background: rgba(255, 246, 241, .48);
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          border-bottom: 1px solid #FFFFFF88;
          transition: background .3s, box-shadow .3s;
        }

        .hb-navbar.scrolled {
          background: rgba(255, 248, 244, .82);
          box-shadow: 0 8px 30px rgba(123, 35, 70, .08);
        }

        .hb-nav-inner {
          width: min(1300px, calc(100% - 48px));
          height: 80px;
          margin: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 25px;
        }

        .hb-nav-links {
          display: flex;
          align-items: center;
          gap: 40px;
        }

        .hb-nav-links button {
          font-size: 13px;
          font-weight: 500;
          color: var(--burgundy);
        }

        .hb-nav-links button:hover {
          color: var(--berry);
        }

        .hb-mobile-menu {
          display: none;
        }

        /* HERO */

        .hb-hero {
          position: relative;
          min-height: 790px;
          display: flex;
          align-items: center;
          padding: 150px 0 100px;
          background: #FFF6F1;
          overflow: hidden;
        }

        .hb-hero-photo {
          position: absolute;
          top: 0;
          right: 0;
          width: 65%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }

        .hb-hero-overlay {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(
              90deg,
              #FFF6F1 0%,
              #FFF6F1 26%,
              rgba(255,246,241,.94) 39%,
              rgba(255,246,241,.54) 54%,
              rgba(255,246,241,0) 72%
            );
        }

        .hb-hero-content {
          position: relative;
          z-index: 2;
          width: min(1250px, calc(100% - 60px));
          margin: auto;
        }

        .hb-hero-title {
          margin-top: 22px;
          font-size: clamp(72px, 9vw, 140px);
          font-weight: 500;
          letter-spacing: -5px;
          line-height: 1;
          color: #7B2346;
        }

        .hb-hero-tagline {
          margin-top: 16px;
          font-size: clamp(24px, 2.8vw, 38px);
          font-family: 'Playfair Display', serif;
          font-weight: 600;
          color: #7B2346;
        }

        .hb-hero-subtitle {
          margin-top: 14px;
          font-size: 17px;
          color: #7B2346;
        }

        /* PROBLEM SOLUTION */

        .hb-problem-section {
          padding: 125px 0;
          background: #FFF9F7;
        }

        .hb-problem-layout {
          display: grid;
          grid-template-columns: 1fr 90px 1fr;
          gap: 28px;
          align-items: stretch;
          margin-top: 45px;
        }

        .hb-problem-box {
          border-radius: 32px;
          padding: 45px;
          background: #FBE7EB;
        }

        .hb-solution-box {
          border-radius: 32px;
          padding: 45px;
          background: #7B2346;
          color: white;
        }

        .hb-transition {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--berry);
        }

        /* HOW IT WORKS */

        .hb-how-section {
          padding: 130px 0;
          background: white;
        }

        .hb-steps-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
          margin-top: 70px;
        }

        .hb-step-card {
          position: relative;
          padding: 35px 25px;
          border-radius: 28px;
          background: #FFF6F1;
          border: 1px solid #F0DDE3;
          transition: all .3s;
        }

        .hb-step-card:hover {
          transform: translateY(-7px);
          box-shadow: 0 20px 45px rgba(123, 35, 70, .08);
        }

        .hb-step-number {
          font-family: 'Playfair Display', serif;
          font-size: 55px;
          color: #E7B8C6;
        }

        .hb-step-icon {
          width: 62px;
          height: 62px;
          display: grid;
          place-items: center;
          border-radius: 20px;
          background: #F6D3DB;
          color: #7B2346;
        }

        /* ABOUT */

        .hb-about-section {
          padding: 135px 0;
          background: #FFF6F1;
        }

        .hb-about-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 85px;
          align-items: center;
        }

        .hb-about-photo {
          width: 100%;
          height: 580px;
          object-fit: cover;
          border-radius: 260px 260px 35px 35px;
        }

        .hb-differentiator {
          display: flex;
          align-items: center;
          gap: 15px;
          margin-top: 18px;
          font-size: 13px;
          color: #674958;
        }

        .hb-differentiator svg {
          color: var(--berry);
          flex-shrink: 0;
        }

        /* FAQ */

        .hb-faq-section {
          padding: 125px 0;
          background: white;
        }

        .hb-faq-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 18px;
          margin-top: 55px;
        }

        .hb-faq-item {
          border: 1px solid #EED9E0;
          border-radius: 16px;
          background: #FFF9F7;
          overflow: hidden;
        }

        .hb-faq-question {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 22px;
          font-size: 13px;
          font-weight: 600;
          text-align: left;
        }

        .hb-faq-answer {
          padding: 0 22px 22px;
          font-size: 12px;
          line-height: 1.9;
          color: #765D68;
        }

        /* CTA */

        .hb-cta-section {
          padding: 100px 0;
          background: #FFF6F1;
        }

        .hb-cta-box {
          border-radius: 40px;
          padding: 85px 60px;
          background: #7B2346;
          color: white;
          text-align: center;
          position: relative;
          overflow: hidden;
        }

        .hb-cta-box::before {
          content: '';
          position: absolute;
          width: 350px;
          height: 350px;
          border: 60px solid #FFFFFF0A;
          border-radius: 50%;
          top: -190px;
          left: -150px;
        }

        .hb-cta-box::after {
          content: '';
          position: absolute;
          width: 350px;
          height: 350px;
          border: 60px solid #FFFFFF0A;
          border-radius: 50%;
          bottom: -190px;
          right: -150px;
        }

        /* FOOTER */

        .hb-footer {
          padding: 80px 0 30px;
          background: #7B2346;
          color: white;
        }

        .hb-footer-grid {
          display: grid;
          grid-template-columns: 1.5fr 1fr 1fr 1fr;
          gap: 45px;
        }

        .hb-footer-link {
          display: block;
          margin-top: 15px;
          font-size: 12px;
          color: #E7C8D3;
        }

        .hb-footer-link:hover {
          color: white;
        }

        @media (max-width: 1050px) {
          .hb-nav-links,
          .hb-nav-desktop {
            display: none !important;
          }

          .hb-mobile-menu {
            display: block;
          }

          .hb-steps-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .hb-about-grid {
            grid-template-columns: 1fr;
          }

          .hb-about-photo {
            height: 500px;
          }

          .hb-footer-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 700px) {
          .hb-container {
            width: calc(100% - 36px);
          }

          .hb-hero {
            min-height: 760px;
            padding: 130px 0 70px;
            align-items: flex-end;
          }

          .hb-hero-photo {
            width: 100%;
            height: 68%;
            top: 0;
            object-position: center top;
          }

          .hb-hero-overlay {
            background: linear-gradient(
              0deg,
              #FFF6F1 12%,
              rgba(255,246,241,.96) 35%,
              rgba(255,246,241,.3) 73%
            );
          }

          .hb-hero-content {
            width: calc(100% - 36px);
          }

          .hb-hero-title {
            font-size: clamp(58px, 15vw, 85px);
            letter-spacing: -3px;
          }

          .hb-hero-tagline {
            font-size: 25px;
          }

          .hb-problem-section,
          .hb-how-section,
          .hb-about-section,
          .hb-faq-section {
            padding: 85px 0;
          }

          .hb-problem-layout {
            grid-template-columns: 1fr;
          }

          .hb-transition {
            transform: rotate(90deg);
            padding: 10px;
          }

          .hb-problem-box,
          .hb-solution-box {
            padding: 30px;
          }

          .hb-steps-grid,
          .hb-faq-grid {
            grid-template-columns: 1fr;
          }

          .hb-about-photo {
            height: 380px;
          }

          .hb-cta-box {
            padding: 65px 25px;
          }

          .hb-footer-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hb-landing *,
          .hb-landing *::before,
          .hb-landing *::after {
            transition: none !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>

      {/* ================= NAVBAR ================= */}
      <header
        className={`hb-navbar ${
          scrolled ? 'scrolled' : ''
        }`}
      >
        <div className="hb-nav-inner">

          <button
            type="button"
            onClick={() => goTo('home')}
          >
            <img
              src={logo}
              alt="HerBloom Logo"
              className="w-[155px] object-contain"
            />
          </button>

          <div className="hb-nav-links">
            {navLinks.map((link) => (
              <button
                type="button"
                key={link.id}
                onClick={() => goTo(link.id)}
              >
                {link.name}
              </button>
            ))}
          </div>

          <div className="hb-nav-desktop flex items-center gap-5">

            <span className="flex items-center gap-2 text-xs font-semibold text-[#7B2346]">
              <Languages size={16} />
              EN / தமிழ்
            </span>

            <button
              type="button"
              onClick={onLogin}
              className="text-xs font-semibold text-[#7B2346]"
            >
              Log In
            </button>

            <button
              type="button"
              onClick={onGetStarted}
              className="hb-btn hb-btn-primary"
            >
              Start Your Journey
              <ArrowRight size={16} />
            </button>
          </div>

          <button
            type="button"
            className="hb-mobile-menu text-[#7B2346]"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-[#EED9E0] bg-[#FFF9F6]/95 px-6 py-6 backdrop-blur-xl">
            <div className="flex flex-col gap-5">
              {navLinks.map((link) => (
                <button
                  type="button"
                  key={link.id}
                  onClick={() => goTo(link.id)}
                  className="text-left text-sm text-[#7B2346]"
                >
                  {link.name}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onLogin?.()
                }}
                className="text-left text-sm font-semibold text-[#7B2346]"
              >
                Log In
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onGetStarted?.()
                }}
                className="hb-btn hb-btn-primary"
              >
                Start Your Journey
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ================= HERO ================= */}
      <section id="home" className="hb-hero">

        <img
          src={HERO_IMAGE}
          alt="Mother holding her newborn baby"
          className="hb-hero-photo"
        />

        <div className="hb-hero-overlay" />

        <div className="hb-hero-content">

          <p className="hb-label">
            FOR SRI LANKAN & TAMIL MOTHERS
          </p>

          <h1 className="hb-hero-title">
            HerBloom
          </h1>

          <h2 className="hb-hero-tagline">
            Recover. Feel better. Bloom again.
          </h2>

          <p className="hb-hero-subtitle">
            A little care, every day.
          </p>

          <div className="mt-9 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={onGetStarted}
              className="hb-btn hb-btn-primary"
            >
              Start My Journey
              <ArrowRight size={18} />
            </button>
          </div>

          <div className="mt-12 flex items-center gap-4">
            <div className="h-[2px] w-14 bg-[#D9A25B]" />

            <span className="text-[10px] font-semibold tracking-[2.5px] text-[#A05E75]">
              MADE FOR YOUR POSTPARTUM CHAPTER
            </span>
          </div>

        </div>
      </section>

      {/* ================= PROBLEM + SOLUTION ================= */}
      <section
        id="problem-solution"
        className="hb-problem-section"
      >
        <div className="hb-container">

          <div className="text-center">
            <p className="hb-label">
              WHY HERBLOOM EXISTS
            </p>

            <h2 className="hb-heading mt-5">
              Every Mother Deserves
              <br />
              <em>Care After Birth.</em>
            </h2>
          </div>

          <div className="hb-problem-layout">

            <div className="hb-problem-box">
              <div className="mb-5 flex items-center gap-3">
                <Heart
                  size={25}
                  color="#7B2346"
                />

                <h3 className="text-3xl font-semibold">
                  The Challenge
                </h3>
              </div>

              <p className="hb-body">
                After childbirth, mothers often face
                physical discomfort, emotional changes,
                and uncertainty while caring for a newborn.
                Finding clear, accessible, and culturally
                relevant recovery information can be
                difficult.
              </p>
            </div>

            <div className="hb-transition">
              <ArrowRight size={40} strokeWidth={1.4} />
            </div>

            <div className="hb-solution-box">
              <div className="mb-5 flex items-center gap-3">
                <Sparkles
                  size={25}
                  color="#D9A25B"
                />

                <h3 className="text-3xl font-semibold">
                  Our Solution
                </h3>
              </div>

              <p className="text-sm leading-8 text-[#FBE7EE]">
                HerBloom brings recovery education,
                emotional wellbeing support, nutrition
                information, tracking tools, and helpful
                reminders together in one caring space —
                so mothers can feel more informed and
                supported throughout recovery.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section
        id="how-it-works"
        className="hb-how-section"
      >
        <div className="hb-container">

          <div className="text-center">
            <p className="hb-label">
              HOW IT WORKS
            </p>

            <h2 className="hb-heading mt-5">
              Support at
              <em> Every Step.</em>
            </h2>

            <p className="hb-body mx-auto mt-5 max-w-[650px]">
              A simple, guided journey with helpful
              tools for a more informed and supported
              postpartum recovery.
            </p>
          </div>

          <div className="hb-steps-grid">
            {steps.map((step) => {
              const Icon = step.icon

              return (
                <div
                  key={step.number}
                  className="hb-step-card"
                >
                  <div className="flex items-start justify-between">
                    <span className="hb-step-number">
                      {step.number}
                    </span>

                    <div className="hb-step-icon">
                      <Icon size={27} strokeWidth={1.7} />
                    </div>
                  </div>

                  <h3 className="mt-7 text-[23px] font-semibold">
                    {step.title}
                  </h3>

                  <p className="mt-4 text-[13px] leading-7 text-[#765D68]">
                    {step.description}
                  </p>
                </div>
              )
            })}
          </div>

        </div>
      </section>

      {/* ================= ABOUT ================= */}
      <section id="about" className="hb-about-section">
        <div className="hb-container hb-about-grid">

          <div>
            <img
              src={ABOUT_IMAGE}
              alt="Mother and newborn"
              className="hb-about-photo"
              loading="lazy"
            />
          </div>

          <div>
            <p className="hb-label">
              ABOUT HERBLOOM
            </p>

            <h2 className="hb-heading mt-5">
              Caring for Mothers,
              <br />
              <em>Beyond Birth.</em>
            </h2>

            <p className="hb-body mt-7">
              HerBloom is a postpartum recovery companion
              designed to make recovery information,
              tracking tools, and wellbeing support more
              accessible to Sri Lankan and Tamil mothers.
            </p>

            <div className="mt-10 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F6D3DB] text-[#7B2346]">
                <Target size={24} />
              </div>

              <div>
                <h3 className="text-xl font-semibold">
                  Our Mission
                </h3>

                <p className="hb-body mt-2">
                  To help mothers feel informed,
                  supported, and respected throughout
                  their postpartum recovery journey.
                </p>
              </div>
            </div>

            <div className="mt-10">
              <h3 className="text-xl font-semibold">
                What Makes Us Different
              </h3>

              {[
                'Designed with Sri Lankan mothers in mind',
                'English and Tamil support planned',
                'Recovery, nutrition, and wellbeing in one place',
              ].map((item) => (
                <div
                  key={item}
                  className="hb-differentiator"
                >
                  <Check size={18} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section id="faq" className="hb-faq-section">
        <div className="hb-container">

          <div className="text-center">
            <p className="hb-label">
              FREQUENTLY ASKED QUESTIONS
            </p>

            <h2 className="hb-heading mt-5">
              Common <em>Questions.</em>
            </h2>

            <p className="hb-body mt-4">
              Quick answers to help you get started.
            </p>
          </div>

          {managedFaqs !== null && <label className="block text-center">
            <select aria-label="FAQ language" value={faqLanguage} onChange={(event) => { setOpenFAQ(null); setManagedFaqs([]); setFaqLanguage(event.target.value) }}>
              <option value="en">English</option><option value="ta">Tamil</option>
            </select>
          </label>}
          <div className="hb-faq-grid">
            {(managedFaqs?.length ? managedFaqs : faqLanguage === 'en' ? faqs : []).map((faq, index) => {
              const isOpen = openFAQ === index

              return (
                <div
                  className="hb-faq-item"
                  key={faq.id ?? faq.question}
                >
                  <button
                    type="button"
                    className="hb-faq-question"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpenFAQ(
                        isOpen ? null : index
                      )
                    }
                  >
                    <span>{faq.question}</span>

                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-[#7B2346] transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <p className="hb-faq-answer">
                      {faq.answer}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

        </div>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="hb-cta-section">
        <div className="hb-container">
          <div className="hb-cta-box">

            <div className="relative z-10">
              <p className="text-xs font-semibold uppercase tracking-[3px] text-[#F6D3DB]">
                YOUR JOURNEY MATTERS
              </p>

              <h2 className="mx-auto mt-7 max-w-[800px] text-[clamp(37px,4.5vw,58px)] font-semibold leading-tight text-white">
                You Care for Everyone.
                <br />
                <em className="text-[#F6D3DB]">
                  Let's Make Space for You.
                </em>
              </h2>

              <p className="mx-auto mt-6 max-w-[600px] text-sm leading-8 text-[#F8DFE7]">
                A caring, all-in-one companion for your
                postpartum recovery journey.
                Discover supportive tools and
                information designed around you.
              </p>

              <button
                type="button"
                onClick={onGetStarted}
                className="hb-btn mt-9 bg-white text-[#7B2346]"
              >
                Start My Journey
                <ArrowRight size={18} />
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="hb-footer">
        <div className="hb-container">

          <div className="hb-footer-grid">

            <div>
              <img
                src={logo}
                alt="HerBloom Logo"
                className="w-[170px] rounded-lg bg-[#FFF6F1] p-2"
              />

              <p className="mt-5 max-w-[280px] text-xs leading-7 text-[#E7C8D3]">
                Recover. Feel better. Bloom again.
                A little care, every day.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold">
                Quick Links
              </h3>

              {navLinks.map((link) => (
                <button
                  type="button"
                  key={link.id}
                  onClick={() => goTo(link.id)}
                  className="hb-footer-link text-left"
                >
                  {link.name}
                </button>
              ))}
            </div>

            <div>
              <h3 className="text-sm font-semibold">
                Contact
              </h3>

              <p className="mt-5 flex items-center gap-2 text-xs text-[#E7C8D3]">
                <Mail size={16} />
                Contact email coming soon
              </p>

              <p className="mt-5 text-xs text-[#E7C8D3]">
                Social media links will be added
                when official accounts are available.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold">
                Legal
              </h3>

              <PublicLegal landing />

              <p className="mt-7 text-xs text-[#E7C8D3]">
                Built with care for mothers.
              </p>
            </div>

          </div>

          <div className="mt-16 flex flex-col justify-between gap-5 border-t border-white/15 pt-7 text-[11px] leading-6 text-[#D9B6C3] md:flex-row">

            <p>
              © {new Date().getFullYear()} HerBloom.
              All rights reserved.
            </p>

            <p className="max-w-[560px]">
              HerBloom provides educational information
              and does not replace professional medical
              advice, diagnosis, or treatment.
            </p>

          </div>

        </div>
      </footer>

    </div>
  )
}
