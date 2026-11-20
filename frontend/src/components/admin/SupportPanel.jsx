import { useEffect, useState } from 'react'
import { AdminStatusChip } from './AdminTable'
import { a13AdminRequest } from '../../services/adminApi'

const ticketStates = ['open', 'pending', 'closed']
const categories = ['account', 'technical', 'billing', 'feedback', 'other']
const faqFields = ['question_en', 'question_ta', 'answer_en', 'answer_ta', 'category', 'sort_order']
const label = (value) => value.replaceAll('_',' ')
const stamp = (value) => value ? new Date(value).toLocaleString('en-LK', {timeZone:'Asia/Colombo'}) : ''

function TicketDetail({ ticket, assignees, canManage, canReply, submit, busy }) {
  return <section className="ha-panel space-y-3">
    <h2 className="font-semibold">{ticket.subject}</h2><p>{ticket.category} · {ticket.status}</p>
    <p className="whitespace-pre-wrap">{ticket.message}</p>
    {canManage && <form className="flex flex-wrap gap-3" key={ticket.updated_at} onSubmit={(event) => {
      event.preventDefault()
      const values = new FormData(event.currentTarget)
      submit('/tickets/'+ticket.id, 'PATCH', { status:values.get('status'), assignee_admin_id:Number(values.get('assignee')) || null }, ticket.id)
    }}>
      <label>Status <select name="status" defaultValue={ticket.status}>{ticketStates.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label>Assigned administrator <select name="assignee" defaultValue={ticket.assignee_admin_id || ''}>
        <option value="">Unassigned</option>{assignees.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <button disabled={busy}>Save changes</button>
    </form>}
    <h3 className="font-semibold">Replies</h3>
    {ticket.replies.map((reply) => <article key={reply.id} className="rounded-lg bg-[#FFF6F1] p-3">
      <time>{stamp(reply.created_at)}</time><p className="whitespace-pre-wrap">{reply.body}</p>
    </article>)}
    {canReply && ticket.status !== 'closed' && <form onSubmit={(event) => {
      event.preventDefault()
      const form = event.currentTarget
      submit('/tickets/'+ticket.id+'/replies','POST',{ body:new FormData(form).get('body') },ticket.id)
        .then((saved) => { if (saved) form.reset() })
    }}>
      <label className="grid gap-2">In-app reply<textarea name="body" required maxLength={4000} className="rounded-lg border p-2" /></label>
      <button disabled={busy}>Send reply</button>
    </form>}
    <h3 className="font-semibold">Ticket history</h3>
    <ul>{ticket.admin_history.map((item,index) =>
      <li key={index}>{stamp(item.created_at)} · {label(item.action.split('.')[1])}</li>)}</ul>
  </section>
}

export default function SupportPanel({ token, permissions }) {
  const [tab,setTab] = useState('tickets')
  const [query,setQuery] = useState('')
  const [rows,setRows] = useState([])
  const [cursor,setCursor] = useState(null)
  const [detail,setDetail] = useState(null)
  const [assignees,setAssignees] = useState([])
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [revision,setRevision] = useState(0)
  const canManage = permissions.includes('support.manage')
  const canReply = permissions.includes('support.reply')
  const send = (path,method,data) => a13AdminRequest(token,'/support'+path,method,data)

  useEffect(() => {
    let active = true
    a13AdminRequest(token,'/support/'+tab+'?'+query).then((page) => {
      if (active) { setRows(page.items);setCursor(page.next_before);setError('') }
    }).catch((failure) => { if (active) setError(failure.message) })
    return () => { active=false }
  },[token,tab,query,revision])

  useEffect(() => {
    if (!canManage) return
    let active = true
    a13AdminRequest(token,'/support/assignees').then((items) => { if (active) setAssignees(items) }).catch(() => {})
    return () => { active = false }
  },[token,canManage])

  async function submit(path,method,data,id) {
    setBusy(true);setError('')
    try {
      const result = await send(path,method,data)
      if (id) setDetail(await send('/tickets/'+id))
      else if (tab === 'faqs') setDetail((value) => ({...value,...result}))
      setRevision((value) => value+1)
      return true
    } catch (failure) { setError(failure.message);return false }
    finally { setBusy(false) }
  }

  async function inspect(row) {
    setError('')
    try { setDetail(tab === 'tickets' ? await send('/tickets/'+row.id) : row) }
    catch (failure) { setError(failure.message) }
  }

  const ticketTab = tab === 'tickets'
  return <section className="space-y-4">
    <nav className="ha-panel flex gap-4" aria-label="Support management">
      {['tickets','faqs'].map((item) => <button type="button" key={item} aria-pressed={tab===item}
        onClick={() => { setRows([]);setDetail(null);setQuery('');setTab(item) }} className="font-semibold text-[#7B2346]">
        {item === 'tickets' ? 'Ticket inbox' : 'FAQs'}</button>)}
    </nav>
    {error && <p role="alert">{error}</p>}
    <section className="ha-panel space-y-4">
      <form key={tab} className="flex flex-wrap gap-3" onSubmit={(event) => {
        event.preventDefault()
        setQuery(new URLSearchParams([...new FormData(event.currentTarget)].filter(([,value])=>value)).toString())
      }}>
        <input name="search" aria-label="Search" maxLength={120} placeholder="Search" className="rounded-lg border p-2" />
        <label>Status <select name="status"><option value="">Any</option>
          {(ticketTab ? ticketStates : ['draft','published']).map((state)=><option key={state}>{state}</option>)}
        </select></label>
        {ticketTab && <label>Category <select name="category"><option value="">Any</option>
          {categories.map((value)=><option key={value}>{value}</option>)}</select></label>}
        {!ticketTab && <label>Category <input name="category" maxLength={60} /></label>}
        {ticketTab && canManage && <label>Assignee <select name="assignee"><option value="">Any</option>
          {assignees.map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
        <button>Apply filters</button>
        {!ticketTab && canManage && <button type="button" onClick={() => setDetail({})}>New FAQ</button>}
      </form>
      {!rows.length && <p>No records match these filters.</p>}
      <ul>{rows.map((row) => <li key={row.id} className="flex justify-between gap-3 border-b border-[#F0DEE4] py-2">
        <button type="button" onClick={() => inspect(row)} className="text-left font-medium text-[#7B2346]">
          {ticketTab ? row.subject : row.question_en}
        </button><span className="flex flex-wrap items-center gap-2">{row.category}{ticketTab && <span>{row.assignee_name || "Unassigned"}</span>}<AdminStatusChip status={row.status}/></span>
      </li>)}</ul>
      {cursor && <button type="button" onClick={async () => {
        try {
          const params = new URLSearchParams(query);params.set('before',cursor)
          const page = await send('/'+tab+'?'+params)
          setRows((previous)=>[...previous,...page.items]);setCursor(page.next_before)
        } catch (failure) { setError(failure.message) }
      }}>Show older records</button>}
    </section>
    {detail && ticketTab && <TicketDetail key={detail.id} ticket={detail} assignees={assignees}
      canManage={canManage} canReply={canReply} submit={submit} busy={busy}/>}
    {detail && !ticketTab && <section className="ha-panel space-y-3">
      <h2 className="font-semibold">{detail.id ? 'FAQ details' : 'New bilingual FAQ'}</h2>
      <form key={detail.id || 'new'} className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault()
        const fields=Object.fromEntries(new FormData(event.currentTarget))
        fields.sort_order=Number(fields.sort_order)
        submit('/faqs'+(detail.id ? '/'+detail.id : ''),detail.id ? 'PUT' : 'POST',fields)
      }}>
        {faqFields.map((field) => <label key={field} className="grid gap-1">{label(field)}
          {field.startsWith('answer') ?
            <textarea name={field} required readOnly={!canManage} defaultValue={detail[field]} maxLength={4000} className="rounded-lg border p-2"/> :
            <input name={field} required readOnly={!canManage} defaultValue={detail[field] ?? (field==='sort_order' ? 0 : '')}
              type={field==='sort_order' ? 'number' : 'text'} min="0" max="100000" className="rounded-lg border p-2"/>}
        </label>)}
        {canManage && <button disabled={busy}>Save FAQ</button>}
      </form>
      {detail.id && canManage && <button disabled={busy} type="button" onClick={() => submit(
        '/faqs/'+detail.id+'/publication','POST',{published:detail.status!=='published'})}>
        {detail.status==='published' ? 'Unpublish' : 'Publish'}
      </button>}
    </section>}
  </section>
}
