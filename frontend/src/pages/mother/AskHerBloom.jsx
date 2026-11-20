import { apiBase as API } from '../../services/apiBase'
import { useEffect, useRef, useState } from 'react'
import {
  Bot, Send, Mic, MicOff, History, Plus,
  Trash2, ThumbsUp, ThumbsDown, X,
  ShieldAlert, HeartHandshake, Info,
  Loader2, Sparkles, MessageCircle,
  BookOpen, RefreshCw
} from 'lucide-react'

import MotherLayout from '../../components/mother/MotherLayout'
import { chatApi } from '../../services/chatApi'



const QUESTIONS = {
  en: [
    'How can I care for my C-section wound?',
    'What foods support postpartum recovery?',
    'How can I manage tiredness after birth?',
    'When should I contact my midwife?',
  ],
  ta: [
    'சிசேரியன் காயத்தை எப்படிப் பராமரிப்பது?',
    'பிரசவத்திற்குப் பிறகு என்ன உணவுகள் நல்லது?',
    'பிரசவத்திற்குப் பின் சோர்வை எப்படி சமாளிப்பது?',
    'எப்போது மருத்துவ மாதுவைத் தொடர்புகொள்ள வேண்டும்?',
  ],
}

function SafetyCard({ message, lang }) {
  const crisis = message.type === 'crisis'

  return (
    <div className={`w-full rounded-2xl border p-5 ${
      crisis
        ? 'border-[#E7C6D7] bg-[#FFF6F9]'
        : 'border-red-200 bg-red-50'
    }`}>
      <div className="mb-3 flex items-center gap-2">
        {crisis
          ? <HeartHandshake className="text-[#7B2346]" />
          : <ShieldAlert className="text-red-700" />}

        <h3 className={`font-semibold ${
          crisis ? 'text-[#7B2346]' : 'text-red-700'
        }`}>
          {crisis
            ? (lang === 'ta' ? 'உதவி கிடைக்கும்' : 'Support Is Available')
            : (lang === 'ta' ? 'அவசர மருத்துவ உதவி' : 'Urgent Medical Help')}
        </h3>
      </div>

      <p className="whitespace-pre-wrap text-sm leading-7 text-[#593849]">
        {message.text}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {crisis && (
          <a
            href="tel:1926"
            className="rounded-full bg-[#7B2346] px-5 py-2 text-sm font-semibold text-white"
          >
            Call 1926
          </a>
        )}

        <a
          href="tel:1990"
          className="rounded-full bg-red-700 px-5 py-2 text-sm font-semibold text-white"
        >
          Call 1990
        </a>
      </div>
    </div>
  )
}

export default function AskHerBloom({
  user,
  onLogout,
  onNavigate,
  onOpenArticle,
  selectedArticleId = null,
}) {
  const token = user?.access_token

  const [lang, setLang] = useState('en')
  const [text, setText] = useState('')
  const [messages, setMessages] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [sessions, setSessions] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const [retryText, setRetryText] = useState('')
  const [article, setArticle] = useState(null)

  const bottomRef = useRef(null)
  const recognitionRef = useRef(null)
  const sendingRef = useRef(false)
  const retryRequest = useRef(null)

  useEffect(() => {
    if (!token) return

    let cancelled = false

    Promise.all([
      chatApi.sessions(token),
      chatApi.consent(token),
    ])
      .then(([history, privacy]) => {
        if (cancelled) return
        setSessions(history)
        setConsent(Boolean(privacy.enabled))
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!selectedArticleId || !token) {
      setArticle(null)
      return
    }

    let cancelled = false

    fetch(`${API}/articles/${selectedArticleId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Could not load the selected article.')
        }
        return response.json()
      })
      .then((data) => {
        if (!cancelled) setArticle(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [selectedArticleId, token])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    })
  }, [messages, busy])

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  async function refreshSessions() {
    const data = await chatApi.sessions(token)
    setSessions(data)
  }

  async function sendMessage(value = text, retry = false) {
    const question = value.trim()

    if (!question || sendingRef.current) return

    const payload = retry && retryRequest.current ? retryRequest.current.payload : {
      session_id: sessionId,
      article_id: selectedArticleId || null,
      text: question,
      lang,
    }
    const key = retry && retryRequest.current ? retryRequest.current.key : crypto.randomUUID()
    retryRequest.current = { key, payload }
    sendingRef.current = true
    setBusy(true)
    setError('')
    setRetryText('')
    setText('')

    const temporary = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: question,
    }

    setMessages((previous) => [
      ...previous,
      temporary,
    ])

    try {
      const response = await chatApi.send(token, payload, key)

      if (response.session_id != null) {
        setSessionId(response.session_id)
      }

      // Safety content should not remain in chat history.
      if (['urgent', 'crisis'].includes(response.type)) {
        setMessages((previous) => [
          ...previous.filter((item) => item.id !== temporary.id),
          {
            id: `safety-${Date.now()}`,
            role: 'assistant',
            text: response.text,
            type: response.type,
            sources: [],
          },
        ])
      } else if (response.type === 'error') {
        setMessages((previous) =>
          previous.filter((item) => item.id !== temporary.id)
        )
        setText(question)
        setRetryText(question)
        setError(response.text)
      } else {
        setMessages((previous) => [
          ...previous,
          {
            id: response.id,
            role: 'assistant',
            text: response.text,
            type: response.type,
            sources: response.sources || [],
          },
        ])

        await refreshSessions()
      }
    } catch (err) {
      setMessages((previous) =>
        previous.filter((item) => item.id !== temporary.id)
      )
      setText(question)
      setRetryText(question)
      setError(err.message)
    } finally {
      sendingRef.current = false
      setBusy(false)
    }
  }

  async function openSession(id) {
    setError('')

    try {
      const result = await chatApi.session(token, id)
      setSessionId(id)
      setMessages(result.messages)
      setHistoryOpen(false)
      setRetryText('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function deleteSession(id) {
    if (!window.confirm('Delete this conversation?')) return

    try {
      await chatApi.deleteSession(token, id)

      if (sessionId === id) {
        setSessionId(null)
        setMessages([])
      }

      await refreshSessions()
    } catch (err) {
      setError(err.message)
    }
  }

  function newChat() {
    setSessionId(null)
    setMessages([])
    setText('')
    setError('')
    setRetryText('')
    setHistoryOpen(false)
  }

  async function toggleConsent() {
    try {
      const result = await chatApi.updateConsent(
        token,
        !consent
      )
      setConsent(Boolean(result.enabled))
    } catch (err) {
      setError(err.message)
    }
  }

  async function feedback(messageId, helpful) {
    try {
      await chatApi.feedback(token, messageId, helpful)

      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId
            ? { ...message, feedback: helpful }
            : message
        )
      )
    } catch (err) {
      setError(err.message)
    }
  }

  function voiceInput() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setError('Voice input is not supported in this browser.')
      return
    }

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = lang === 'ta' ? 'ta-LK' : 'en-LK'
    recognition.interimResults = false
    recognition.continuous = false

    recognition.onresult = (event) => {
      setText(event.results[0][0].transcript)
    }

    recognition.onerror = () => {
      setListening(false)
      setError('Voice recognition could not complete.')
    }

    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition

    try {
      recognition.start()
      setListening(true)
    } catch {
      setError('Could not start voice recognition.')
    }
  }

  function openArticle(articleId) {
    if (onOpenArticle) {
      onOpenArticle(articleId)
    } else {
      setError('Article navigation is not connected yet.')
    }
  }

  const articleTitle = article
    ? (lang === 'ta' ? article.title_ta : article.title_en)
    : ''

  return (
    <MotherLayout
      user={user}
      onLogout={onLogout}
      onNavigate={onNavigate}
      activePage="chat"
    >
      <div className="flex h-[calc(100vh-110px)] min-h-[580px] flex-col overflow-hidden rounded-3xl border border-[#F1DCE4] bg-[#FFF9F6]">

        <div className="flex items-center justify-between gap-3 border-b border-[#F1DCE4] bg-white px-6 py-4">
          <div>
            <h1 className="flex items-center gap-2 font-['Playfair_Display'] text-2xl font-bold text-[#7B2346]">
              Ask HerBloom AI
              <Sparkles size={19} className="text-[#D9A25B]" />
            </h1>
            <p className="mt-1 text-xs text-[#977A86]">
              Your friendly recovery education companion
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="rounded-full border border-[#EBD7DF] px-3 py-2 text-xs text-[#7B2346]"
            >
              <option value="en">EN</option>
              <option value="ta">தமிழ்</option>
            </select>

            <button
              type="button"
              onClick={newChat}
              title="New conversation"
              className="rounded-full bg-[#F6D3DB] p-2 text-[#7B2346]"
            >
              <Plus size={18} />
            </button>

            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-2 rounded-full bg-[#FFF0F3] px-3 py-2 text-xs font-semibold text-[#7B2346]"
            >
              <History size={16} />
              History
            </button>
          </div>
        </div>

        {article && (
          <div className="flex items-center gap-3 border-b border-[#F1DCE4] bg-[#FFF0F3] px-6 py-3">
            <BookOpen size={18} className="shrink-0 text-[#7B2346]" />

            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-[#977A86]">
                Asking about this article
              </p>
              <p className="truncate text-sm font-medium text-[#7B2346]">
                {articleTitle}
              </p>
            </div>

            <button
              type="button"
              onClick={() => openArticle(article.id)}
              className="text-xs font-semibold text-[#7B2346] underline"
            >
              View article
            </button>
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          {!messages.length && (
            <div className="mx-auto max-w-2xl py-8 text-center">
              <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-[30px] bg-[#F6D3DB]">
                <Bot size={55} className="text-[#7B2346]" />
              </div>

              <h2 className="font-['Playfair_Display'] text-3xl text-[#7B2346]">
                Hello, I'm HerBloom
              </h2>

              <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[#795C69]">
                Ask about postpartum recovery.
                Answers are based on available reviewed articles.
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {QUESTIONS[lang].map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => sendMessage(question)}
                    disabled={busy}
                    className="rounded-2xl border border-[#F0D8E1] bg-white p-4 text-left text-sm text-[#7B2346] transition hover:bg-[#FCE9EF]"
                  >
                    <MessageCircle size={17} className="mb-2" />
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === 'user'
                  ? 'justify-end'
                  : 'justify-start'
              }`}
            >
              {['urgent', 'crisis'].includes(message.type) ? (
                <div className="w-full max-w-2xl">
                  <SafetyCard message={message} lang={lang} />
                </div>
              ) : (
                <div className={`max-w-[85%] rounded-3xl px-5 py-4 ${
                  message.role === 'user'
                    ? 'rounded-tr-md bg-[#F6D3DB] text-[#5C1935]'
                    : 'rounded-tl-md border border-[#F0D8E1] bg-white text-[#593849]'
                }`}>
                  {message.role === 'assistant' && (
                    <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[#7B2346]">
                      <Bot size={17} />
                      HerBloom AI
                    </div>
                  )}

                  <p className="whitespace-pre-wrap text-sm leading-7">
                    {message.text}
                  </p>

                  {!!message.sources?.length && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {message.sources.map((source) => (
                        <button
                          key={source.article_id}
                          type="button"
                          onClick={() => openArticle(source.article_id)}
                          className="rounded-full border border-[#E8C9D4] bg-[#FFF6F1] px-3 py-1.5 text-xs text-[#7B2346]"
                        >
                          <BookOpen size={13} className="mr-1 inline" />
                          {source.title}
                        </button>
                      ))}
                    </div>
                  )}

                  {message.role === 'assistant' &&
                    message.type === 'answer' && (
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => feedback(message.id, true)}
                        aria-label="Helpful"
                        className={`rounded-full p-2 ${
                          message.feedback === true
                            ? 'bg-[#F6D3DB]'
                            : 'bg-[#FFF6F1]'
                        }`}
                      >
                        <ThumbsUp size={15} />
                      </button>

                      <button
                        type="button"
                        onClick={() => feedback(message.id, false)}
                        aria-label="Not helpful"
                        className={`rounded-full p-2 ${
                          message.feedback === false
                            ? 'bg-[#F6D3DB]'
                            : 'bg-[#FFF6F1]'
                        }`}
                      >
                        <ThumbsDown size={15} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-sm text-[#7B2346]">
              <Loader2 size={17} className="animate-spin" />
              HerBloom is preparing a response...
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[#F1DCE4] bg-white p-4">
          {error && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3">
              <p className="text-xs text-red-700">
                {error}
              </p>

              {retryText && (
                <button
                  type="button"
                  onClick={() => sendMessage(retryText, true)}
                  disabled={busy}
                  className="flex shrink-0 items-center gap-1 text-xs font-semibold text-red-700"
                >
                  <RefreshCw size={14} />
                  Retry
                </button>
              )}
            </div>
          )}

          <div className="mb-3 flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-[#795C69]">
              <input
                type="checkbox"
                checked={consent}
                onChange={toggleConsent}
              />
              Use my recovery details
            </label>

            <span
              title="Only postpartum week, delivery type and feeding method are shared when enabled. Your question is sent to Gemini when a relevant reviewed article is found."
              className="cursor-help text-[#7B2346]"
            >
              <Info size={15} />
            </span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              sendMessage()
            }}
            className="flex items-center gap-3 rounded-full border border-[#EBD7DF] bg-[#FFF9F6] px-4 py-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1500}
              placeholder={
                lang === 'ta'
                  ? 'உங்கள் கேள்வியை எழுதுங்கள்...'
                  : 'Ask your question...'
              }
              className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
            />

            <button
              type="button"
              onClick={voiceInput}
              aria-label="Voice input"
              className="text-[#977A86]"
            >
              {listening
                ? <MicOff size={20} />
                : <Mic size={20} />}
            </button>

            <button
              type="submit"
              disabled={busy || !text.trim()}
              aria-label="Send message"
              className="rounded-full bg-[#7B2346] p-3 text-white disabled:opacity-40"
            >
              <Send size={18} />
            </button>
          </form>

          <p className="mt-2 text-center text-[11px] text-[#977A86]">
            Educational support only, not a medical diagnosis.
            Questions may be sent to Google Gemini.
          </p>
        </div>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-[#2C0E1C]/50">
          <div className="h-full w-full max-w-sm overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-['Playfair_Display'] text-2xl text-[#7B2346]">
                Chat History
              </h2>

              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close history"
              >
                <X size={22} />
              </button>
            </div>

            <button
              type="button"
              onClick={newChat}
              className="mb-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#7B2346] py-3 text-sm text-white"
            >
              <Plus size={17} />
              New Conversation
            </button>

            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center gap-2 rounded-2xl bg-[#FFF6F1] p-3"
                >
                  <button
                    type="button"
                    onClick={() => openSession(session.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-[#7B2346]"
                  >
                    {session.title}
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteSession(session.id)}
                    aria-label="Delete conversation"
                    className="text-red-500"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}

              {!sessions.length && (
                <p className="text-sm text-[#977A86]">
                  No conversations yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </MotherLayout>
  )
}
