import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField } from '@mui/material'
import AdminTable from './AdminTable'
import SafeMarkdown from '../SafeMarkdown'
import { legalLabels } from '../../services/legalTypes'
import { settingsAdminRequest } from '../../services/adminApi'

const blankLegal = {type:'privacy',body_en:'',body_ta:''}
const empty = {items:[],total:0,roles:[]}
const columns = {
  admins: [
    {field:'name',headerName:'Name',minWidth:150,flex:1},
    {field:'email',headerName:'Email',minWidth:190,flex:1},
    {field:'roles',headerName:'Roles',minWidth:145,renderCell:({value})=>value.map((role)=>role.name).join(', ')},
    {field:'active',headerName:'Status',width:110,renderCell:({value})=>value?'Active':'Inactive'},
    {field:'totp_enabled',headerName:'2FA',width:100,renderCell:({value})=>value?'Enabled':'Not set up'},
  ],
  legal: [
    {field:'type',headerName:'Legal page',minWidth:170,flex:1,renderCell:({value})=>legalLabels[value]},
    {field:'version',headerName:'Version',width:100},
    {field:'published_at',headerName:'Published',minWidth:165,flex:1,renderCell:({value})=>value||'Draft'},
  ],
  audit: [
    {field:'admin_name',headerName:'Administrator',minWidth:145,flex:1},
    {field:'entity',headerName:'Entity',minWidth:135},
    {field:'action',headerName:'Action',minWidth:190,flex:1},
    {field:'created_at',headerName:'Date and time',minWidth:175},
  ],
}

function RolesSelect({ roles, values, onChange, disabled }) {
  return <fieldset className="rounded-lg border border-[#F6D3DB] p-3" disabled={disabled}>
    <legend>Roles</legend>
    {roles.map((role)=><FormControlLabel key={role.id} label={role.name}
      control={<Checkbox checked={values.includes(role.id)} onChange={(event)=>onChange(event.target.checked
        ? [...values,role.id] : values.filter((id)=>id!==role.id))} />} />)}
  </fieldset>
}

function SiteForm({ settings, canManage, busy, save }) {
  const [form,setForm] = useState(settings)
  const change=(key,value)=>setForm((current)=>({...current,[key]:value}))
  return <form className="grid max-w-3xl gap-4" onSubmit={(event)=>{event.preventDefault();save(form)}}>
    <FormControlLabel label="Support Tamil alongside English" control={<Checkbox disabled={!canManage||busy}
      checked={form.supported_languages.includes('ta')} onChange={(event)=>change('supported_languages',event.target.checked?['en','ta']:['en'])}/>}/>
    <div className="grid gap-3 sm:grid-cols-2">
      {[['en','English'],['ta','Tamil']].map(([key,label])=><TextField key={key} disabled={!canManage||busy}
        label={label+' maintenance notice'} multiline minRows={3} value={form['maintenance_banner_'+key]}
        slotProps={{htmlInput:{maxLength:500}}} onChange={(event)=>change('maintenance_banner_'+key,event.target.value)}/>)}
    </div>
    <TextField disabled={!canManage||busy} type="email" label="Support email" value={form.support_email??''}
      onChange={(event)=>change('support_email',event.target.value||null)}/>
    <FormControlLabel label="Show Stage 2 overview tiles" control={<Checkbox disabled={!canManage||busy}
      checked={form.stage2_enabled} onChange={(event)=>change('stage2_enabled',event.target.checked)}/>}/>
    {canManage && <Button disabled={busy} type="submit" variant="contained">Save settings</Button>}
  </form>
}

function AuditFilters({ filters, apply, download, busy }) {
  const [form,setForm] = useState(filters)
  const fields=[['admin_id','Admin ID','number'],['entity','Entity','text'],['action','Action','text'],['from_date','From','date'],['to_date','Through','date']]
  return <form className="flex flex-wrap items-end gap-3" onSubmit={(event)=>{event.preventDefault();apply(form)}}>
    {fields.map(([key,label,type])=><TextField key={key} label={label} type={type} size="small" value={form[key]||''}
      slotProps={{inputLabel:{shrink:type==='date'||undefined},htmlInput:{min:type==='number'?1:undefined}}}
      onChange={(event)=>setForm((current)=>({...current,[key]:event.target.value}))}/>)}
    <Button type="submit">Apply filters</Button>
    <Button type="button" onClick={()=>download(filters)} disabled={busy}>Download filtered CSV</Button>
  </form>
}

function AuditDiff({ record }) {
  const fields=[...new Set([...Object.keys(record.before),...Object.keys(record.after)])].sort()
  return <div className="space-y-3">
    <p>{record.entity} · {record.action}</p>
    <p>Values containing private or unstructured text are redacted.</p>
    {!fields.length && <p>No shareable fields were recorded.</p>}
    {fields.map((key)=><div key={key} className={record.changed_fields.includes(key)?'rounded-lg bg-[#FFF6F1] p-3':'p-3'}>
      <strong>{key}{record.changed_fields.includes(key)?' · Changed':''}</strong>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>Before<pre className="whitespace-pre-wrap">{JSON.stringify(record.before[key]??null,null,2)}</pre></div>
        <div>After<pre className="whitespace-pre-wrap">{JSON.stringify(record.after[key]??null,null,2)}</pre></div>
      </div>
    </div>)}
  </div>
}

function LegalForm({ values, disabled, update }) {
  const [lang,setLang] = useState('en')
  return <div className="space-y-4">
    <TextField fullWidth select label="Legal page" disabled={disabled||Boolean(values.id)} value={values.type}
      onChange={(event)=>update('type',event.target.value)}>
      {Object.entries(legalLabels).map(([key,label])=><MenuItem key={key} value={key}>{label}</MenuItem>)}
    </TextField>
    <div className="grid gap-3 sm:grid-cols-2">
      {[['en','English'],['ta','Tamil']].map(([key,label])=><TextField key={key} required disabled={disabled}
        label={label+' Markdown'} multiline minRows={7} value={values['body_'+key]}
        slotProps={{htmlInput:{maxLength:30000}}} onChange={(event)=>update('body_'+key,event.target.value)}/>)}
    </div>
    <div className="rounded-lg border border-[#F6D3DB] p-3">
      <Button aria-pressed={lang==='en'} onClick={()=>setLang('en')}>English preview</Button>
      <Button aria-pressed={lang==='ta'} onClick={()=>setLang('ta')}>Tamil preview</Button>
      <div lang={lang}><SafeMarkdown body={values['body_'+lang]} /></div>
    </div>
  </div>
}

export default function SettingsManager({token,permissions}) {
  const manage=permissions.includes('settings.manage')
  const view=permissions.includes('settings.view')
  const audits=permissions.includes('audit.view')
  const tabs=[...(manage?[['admins','Admin accounts']]:[]),...(view?[['site','App settings'],['legal','Legal pages']]:[]),...(audits?[['audit','Audit log']]:[])]
  const [tab,setTab]=useState(()=>tabs[0]?.[0])
  const [page,setPage]=useState(0)
  const [pageSize,setPageSize]=useState(10)
  const [filter,setFilter]=useState({})
  const [revision,refresh]=useState(0)
  const [result,setResult]=useState(null)
  const [editor,setEditor]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const send=useMemo(()=>(path,method,data,format)=>settingsAdminRequest(token,path,method,data,format),[token])
  const query=useMemo(()=>{
    if (!tab||tab==='site') return ''
    const params=new URLSearchParams({page:page+1,page_size:pageSize})
    for (const [k,v] of Object.entries(filter)) if (v) params.set(k,v)
    return '/'+tab+'?'+params
  },[tab,page,pageSize,filter])
  useEffect(()=>{
    if (!tab) return
    let active=true
    send(query).then((data)=>{if(active)setResult({query,revision,data})})
      .catch((reason)=>{if(active)setResult({query,revision,error:reason.message})})
    return ()=>{active=false}
  },[query,revision,send,tab])
  const current=result?.query===query&&result.revision===revision?result:null

  async function operate(operation, close=false) {
    if (busy) return
    setBusy(true);setError('');setNotice('')
    try {
      await operation()
      if(close)setEditor(null)
      refresh((value)=>value+1)
    } catch(reason){setError(reason.message)}
    finally{setBusy(false)}
  }
  function show(mode,row={}) {
    setNotice('');setError('')
    setEditor({mode,row,data:{...row,role_ids:row.roles?.map((role)=>role.id)??[]}})
  }
  function update(key,value) {
    setEditor((state)=>({...state,data:{...state.data,[key]:value}}))
  }
  function mutation(method,path,body) {
    operate(async()=>{await send(path,method,body);setNotice('Change saved.')},true)
  }
  function download(filters) {
    operate(async()=>{
      const params=new URLSearchParams(Object.entries(filters).filter(([,value])=>value))
      const data=await send('/audit.csv?'+params,'GET',undefined,'blob')
      const url=URL.createObjectURL(data)
      const a=document.createElement('a')
      a.href=url;a.download='herbloom-audit.csv';document.body.append(a);a.click();a.remove()
      setTimeout(()=>URL.revokeObjectURL(url),1000)
    })
  }
  const saveEditor=(event)=>{
    event.preventDefault()
    const data=editor.data
    if(editor.mode==='invite') mutation('POST','/admins/invite',{name:data.name,email:data.email,role_ids:data.role_ids})
    if(editor.mode==='account') mutation('PUT','/admins/'+data.id+'/roles',{role_ids:data.role_ids})
    if(editor.mode==='legal') mutation(data.id?'PUT':'POST','/legal'+(data.id?'/'+data.id:''),{
      type:data.type,body_en:data.body_en,body_ta:data.body_ta})
  }
  if(!tabs.length)return <Alert severity="warning">Settings access is required.</Alert>
  const data=current?.data??empty
  const names=Object.fromEntries(tabs)
  return <section className="space-y-4">
    <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
      {tabs.map(([key,label])=><Button key={key} variant={tab===key?'contained':'outlined'} aria-pressed={tab===key}
        onClick={()=>{setTab(key);setPage(0);setFilter({});setError('');setNotice('')}}>{label}</Button>)}
    </nav>
    {current?.error&&<Alert severity="error">{current.error}</Alert>}
    {!editor&&error&&<Alert severity="error">{error}</Alert>}
    {notice&&<Alert severity="success">{notice}</Alert>}
    {tab==='audit'&&<AuditFilters filters={filter} apply={(value)=>{setFilter(value);setPage(0)}} busy={busy} download={download}/>}
    {tab==='site' ? current?.data ?
      <SiteForm key={revision} settings={current.data} canManage={manage} busy={busy}
        save={(value)=>operate(async()=>{await send('','PUT',value);setNotice('Settings saved.')})}/> :
      !current?.error&&<p role="status">Loading settings…</p> :
      <AdminTable key={tab} title={names[tab]} columns={columns[tab]} rows={data.items} total={data.total}
        loading={!current} page={page} pageSize={pageSize} onPageChange={setPage}
        onPageSizeChange={(value)=>{setPageSize(value);setPage(0)}} onRefresh={()=>refresh((value)=>value+1)}
        onView={(row)=>{if(tab==='audit')operate(async()=>show('audit',await send('/audit/'+row.id)))
          else show(tab==='admins'?'account':'legal',row)}}
        onCreate={manage&&current?.data&&tab!=='audit'?()=>show(tab==='admins'?'invite':'legal',tab==='legal'?blankLegal:{}):undefined}
        createLabel={tab==='admins'?'Invite admin':'New legal version'}/>}
    {editor&&<Dialog open fullWidth maxWidth="md" onClose={()=>{if(!busy)setEditor(null)}}>
      <form onSubmit={saveEditor}>
        <DialogTitle>{{invite:'Invite administrator',account:'Administrator',legal:'Legal page',audit:'Audit entry'}[editor.mode]}</DialogTitle>
        <DialogContent dividers className="space-y-4">
          {error&&<Alert severity="error">{error}</Alert>}
          {editor.mode==='audit'&&<AuditDiff record={editor.row}/>}
          {editor.mode==='legal'&&<LegalForm values={editor.data} disabled={!manage||busy||Boolean(editor.data.published_at)} update={update}/>}
          {(editor.mode==='invite'||editor.mode==='account')&&<>
            {editor.mode==='invite'?<>
              <TextField label="Name" required fullWidth value={editor.data.name??''} onChange={(event)=>update('name',event.target.value)}/>
              <TextField label="Email" required fullWidth type="email" value={editor.data.email??''} onChange={(event)=>update('email',event.target.value)}/>
            </>:<p>{editor.row.name} · {editor.row.email}</p>}
            <RolesSelect roles={data.roles} values={editor.data.role_ids} disabled={busy} onChange={(value)=>update('role_ids',value)}/>
          </>}
        </DialogContent>
        <DialogActions>
          {editor.mode==='account'&&editor.row.active&&['reset-2fa','deactivate'].map((action)=><Button key={action}
            color="error" disabled={busy} onClick={()=>{if(window.confirm('Confirm this administrator action?'))
              mutation('POST','/admins/'+editor.row.id+'/'+action)}}>{action==='reset-2fa'?'Reset 2FA':'Deactivate'}</Button>)}
          {editor.mode==='legal'&&manage&&editor.row.id&&!editor.row.published_at&&<Button disabled={busy} onClick={()=>{
            if(window.confirm('Publish the saved version? Unsaved text changes are excluded.'))
              mutation('POST','/legal/'+editor.row.id+'/publish')
          }}>Publish saved version</Button>}
          <Button disabled={busy} onClick={()=>setEditor(null)}>Close</Button>
          {(editor.mode==='account'||editor.mode==='invite'||(editor.mode==='legal'&&manage&&!editor.row.published_at))&&
            <Button type="submit" variant="contained" disabled={busy||(editor.mode!=='legal'&&!editor.data.role_ids.length)}>
              {editor.mode==='invite'?'Send invitation':'Save'}</Button>}
        </DialogActions>
      </form>
    </Dialog>}
  </section>
}
