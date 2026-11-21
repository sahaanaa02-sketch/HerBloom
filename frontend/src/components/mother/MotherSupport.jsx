import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { publishedFaqs, ticketRequest } from '../../services/supportApi'

const labels = {
  en: {
    support:'Help and Contact Us', close:'Close', faq:'Frequently asked questions', contact:'New ticket',
    tickets:'My tickets', subject:'Subject', body:'Message', category:'Category', send:'Submit ticket',
    noTickets:'No tickets yet.', error:'Support is temporarily unavailable. Please try again.',
    note:'Use this form for app support. Please avoid medical details and use emergency services for urgent concerns.',
    more:'Show older tickets', back:'Back to tickets', replies:'Support replies', history:'Ticket history',
    account:'Account', technical:'Technical', billing:'Billing', feedback:'Feedback', other:'Other',
    open:'Open', pending:'Pending', closed:'Closed',
  },
  ta: {
    support:'உதவி மற்றும் தொடர்பு', close:'மூடவும்', faq:'அடிக்கடி கேட்கப்படும் கேள்விகள்', contact:'புதிய கோரிக்கை',
    tickets:'எனது கோரிக்கைகள்', subject:'தலைப்பு', body:'செய்தி', category:'வகை', send:'கோரிக்கையை அனுப்பவும்',
    noTickets:'இதுவரை கோரிக்கைகள் இல்லை.', error:'உதவி தற்காலிகமாகக் கிடைக்கவில்லை. மீண்டும் முயலவும்.',
    note:'செயலிக்கான உதவிக்கு இந்தப் படிவத்தைப் பயன்படுத்தவும். மருத்துவ விவரங்களைத் தவிர்க்கவும். அவசரத்திற்கு அவசர சேவைகளை அணுகவும்.',
    more:'பழைய கோரிக்கைகளைக் காட்டவும்', back:'கோரிக்கைகளுக்குத் திரும்பவும்', replies:'உதவிக் குழுவின் பதில்கள்', history:'கோரிக்கை வரலாறு',
    account:'கணக்கு', technical:'தொழில்நுட்பம்', billing:'கட்டணம்', feedback:'கருத்து', other:'பிற',
    open:'திறந்தது', pending:'நிலுவை', closed:'மூடப்பட்டது',
  },
}
const categories = ['account','technical','billing','feedback','other']

export default function MotherSupport({ token, initialLanguage, onClose }) {
  const { t: uiText } = useTranslation('common')
  const dialog=useRef(null)
  const [tab,setTab]=useState('faq')
  const [language,setLanguage]=useState(initialLanguage === 'ta' ? 'ta' : 'en')
  const [faqs,setFaqs]=useState([])
  const [tickets,setTickets]=useState([])
  const [cursor,setCursor]=useState(null)
  const [ticket,setTicket]=useState(null)
  const [error,setError]=useState(false)
  const [busy,setBusy]=useState(false)
  const copy=labels[language]

  useEffect(() => { dialog.current.showModal() },[])
  useEffect(() => {
    const abort=new AbortController()
    publishedFaqs(language,abort.signal)
      .then((result)=>{if (!abort.signal.aborted) setFaqs(result.items)})
      .catch(()=>{if (!abort.signal.aborted) setError(true)})
    return ()=>abort.abort()
  },[language])
  useEffect(()=>{
    if(tab!=='tickets') return
    let active=true
    ticketRequest(token).then((page)=>{if(active){setTickets(page.items);setCursor(page.next_before)}})
      .catch(()=>{if(active)setError(true)})
    return ()=>{active=false}
  },[token,tab])

  async function send(event) {
    event.preventDefault()
    setBusy(true);setError(false)
    try {
      setTicket(await ticketRequest(token,'',Object.fromEntries(new FormData(event.currentTarget))))
      setTab('tickets')
    } catch {setError(true)}
    finally {setBusy(false)}
  }
  async function open(id) {
    try {setTicket(await ticketRequest(token,'/'+id));setError(false)}
    catch {setError(true)}
  }
  async function more() {
    try {
      const page=await ticketRequest(token,'?before='+cursor)
      setTickets((previous)=>[...previous,...page.items]);setCursor(page.next_before)
    } catch {setError(true)}
  }

  return <dialog ref={dialog} onClose={onClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(94vw,42rem)] overflow-y-auto overscroll-contain rounded-2xl border border-[#F2DEE5] bg-white p-4 sm:p-6 text-[#593849] shadow-2xl backdrop:bg-black/35" aria-label={copy.support}>
    <header className="mb-4 flex items-center justify-between">
      <h2 className="font-['Playfair_Display'] text-xl font-semibold text-[#7B2346]">{copy.support}</h2>
      <button type="button" onClick={()=>dialog.current.close()}>{copy.close}</button>
    </header>
    <div className="mb-4 flex flex-wrap gap-3">
      {['faq','contact','tickets'].map((key)=><button type="button" key={key} aria-pressed={tab===key}
        className="min-h-11 rounded-xl bg-[#FFF6F1] px-3 py-2 text-sm hover:bg-[#FBE8ED] aria-pressed:bg-[#F6D3DB]"
        onClick={()=>{setTab(key);setTicket(null);setError(false)}}>{copy[key]}</button>)}
      <select aria-label={uiText('language')} value={language} onChange={(event)=>{setFaqs([]);setLanguage(event.target.value)}}>
        <option value="en">English</option><option value="ta">தமிழ்</option>
      </select>
    </div>
    {error && <p role="alert">{copy.error}</p>}
    {tab==='faq' && <div>{faqs.map((faq)=><details className="border-b border-[#F2DEE5] py-2" key={faq.id}>
      <summary className="cursor-pointer font-medium">{faq.question}</summary>
      <p className="mt-2 whitespace-pre-wrap">{faq.answer}</p>
    </details>)}</div>}
    {tab==='contact' && <form className="grid gap-3" onSubmit={send}>
      <p className="text-sm">{copy.note}</p>
      <label className="grid gap-1">{copy.category}<select required name="category" className="min-h-11 min-w-0 rounded-xl border border-[#E8C3CC] bg-white px-3 py-2">
        {categories.map((key)=><option key={key} value={key}>{copy[key]}</option>)}
      </select></label>
      <label className="grid gap-1">{copy.subject}<input required name="subject" maxLength={160} className="min-h-11 min-w-0 rounded-xl border border-[#E8C3CC] bg-white px-3 py-2"/></label>
      <label className="grid gap-1">{copy.body}<textarea required name="message" maxLength={4000} className="min-h-11 min-w-0 rounded-xl border border-[#E8C3CC] bg-white px-3 py-2"/></label>
      <button disabled={busy} className="rounded-lg bg-[#7B2346] px-4 py-2 text-white">{copy.send}</button>
    </form>}
    {tab==='tickets' && (ticket ? <article className="space-y-3">
      <button type="button" onClick={()=>setTicket(null)}>{copy.back}</button>
      <h3 className="font-semibold">{ticket.subject} · {copy[ticket.status]}</h3>
      <p className="whitespace-pre-wrap">{ticket.message}</p>
      <h4 className="font-semibold">{copy.replies}</h4>
      {ticket.replies.map((reply)=><div key={reply.id} className="rounded-lg bg-[#FFF6F1] p-3">
        <time>{new Date(reply.created_at).toLocaleString(language==='ta'?'ta-LK':'en-LK',{timeZone:'Asia/Colombo'})}</time>
        <p className="whitespace-pre-wrap">{reply.body}</p>
      </div>)}
      <h4 className="font-semibold">{copy.history}</h4>
      <ol>{ticket.status_history.map((item,index) => <li key={index}>
        {new Date(item.created_at).toLocaleString(language==='ta'?'ta-LK':'en-LK',{timeZone:'Asia/Colombo'})} · {copy[item.status]}
      </li>)}</ol>
    </article> : <>
      {!tickets.length && <p>{copy.noTickets}</p>}
      <ul>{tickets.map((row)=><li key={row.id} className="border-b border-[#F2DEE5] py-2">
        <button type="button" className="text-[#7B2346] underline" onClick={()=>open(row.id)}>{row.subject}</button> · {copy[row.status]}
      </li>)}</ul>
      {cursor && <button type="button" onClick={more}>{copy.more}</button>}
    </>)}
  </dialog>
}
