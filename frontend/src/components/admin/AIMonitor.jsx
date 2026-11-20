import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField } from '@mui/material'
import { Bar, ComposedChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import AdminTable, { AdminStatusChip } from './AdminTable'
import { aiAdminRequest } from '../../services/adminApi'

const features = {scan:'Meal scanner',chat:'Chat',summary:'Weekly summary',plan:'Meal planner'}
const states = {new:'New',reviewed:'Reviewed',content_fixed:'Content fixed'}
const tabs = {usage:'Usage',settings:'Feature settings',prompts:'Prompt versions',feedback:'Feedback'}
const numeric = {
  max_output_tokens:'Maximum output tokens', temperature:'Temperature', daily_limit_free:'Free daily limit',
  daily_limit_premium:'Premium daily limit', price_in_per_m:'Input USD per million tokens', price_out_per_m:'Output USD per million tokens',
}
const empty = {items:[],total:0}
const formatCount = (num) => num == null ? 'Unavailable' : Number(num).toLocaleString()
const formatCost = (num) => num == null ? 'Unavailable' : '$' + Number(num).toFixed(6)

function Usage({ data, filter, update }) {
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-3">
      {['start','end'].map((key)=><TextField key={key} type="date" size="small" label={key==='start'?'From (UTC)':'Through (UTC)'}
        value={filter[key]||data?.[key]||''} slotProps={{inputLabel:{shrink:true},htmlInput:{max:data?.as_of}}}
        onChange={(event)=>update(key,event.target.value)}/>)}
      <TextField select size="small" label="Feature" value={filter.feature||''} onChange={(event)=>update('feature',event.target.value)}>
        <MenuItem value="">All features</MenuItem>
        {Object.entries(features).map(([id,label])=><MenuItem key={id} value={id}>{label}</MenuItem>)}
      </TextField>
    </div>
    {data && <>
      <div className="ha-stats ha-overview-stats">
        {[
          ['Calls',formatCount(data.totals.calls)],
          ['Success rate',data.totals.success_rate==null?'Unavailable':data.totals.success_rate+'%'],
          ['Average latency',data.totals.average_latency_ms==null?'Unavailable':Math.round(data.totals.average_latency_ms)+' ms'],
          ['Month-to-date estimated cost',formatCost(data.month_to_date.cost_usd)],
        ].map(([label,value])=><div className="ha-stat-card" key={label}><p>{label}</p><strong>{value}</strong></div>)}
      </div>
      <section className="ha-panel">
        <h3>Daily calls and estimated cost</h3>
        {data.totals.calls===0&&<p>No AI requests in the selected range.</p>}
        <div className="ha-safety-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.daily} accessibilityLayer>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(date)=>date.slice(5)} />
              <YAxis yAxisId="calls" allowDecimals={false} />
              <YAxis yAxisId="cost" orientation="right" tickFormatter={(cost)=>'$'+cost} />
              <Tooltip formatter={(value,name)=>name==='Estimated USD'?formatCost(value):value}/>
              <Legend/><Bar dataKey="calls" name="Calls" fill="#7B2346" yAxisId="calls"/>
              <Line type="monotone" dataKey="cost_usd" name="Estimated USD" stroke="#D9A25B" yAxisId="cost" dot={false}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="ha-panel overflow-x-auto">
        <h3>Usage by feature</h3>
        <table className="w-full text-left text-sm"><thead><tr>
          {['Feature','Calls','Input tokens','Output tokens','Priced calls','Estimated cost'].map((label)=><th className="p-2" key={label}>{label}</th>)}
        </tr></thead><tbody>
          {data.by_feature.map((row)=><tr key={row.feature}>
            {[features[row.feature],formatCount(row.calls),formatCount(row.input_tokens),formatCount(row.output_tokens),
              formatCount(row.priced_calls),formatCost(row.cost_usd)].map((v,i)=><td key={i} className="p-2">{v}</td>)}
          </tr>)}
        </tbody></table>
      </section>
      <section className="ha-panel"><h3>Scanner correction rate</h3>
        <p>{data.scanner.correction_rate==null?'No reviews recorded.':data.scanner.correction_rate+'% of reviewed scans were corrected.'}</p>
        <p>{data.scanner.corrected} corrected · {data.scanner.reviewed} reviewed · {data.scanner.successful} successful scans</p>
      </section>
    </>}
  </section>
}

function ConfigForm({ row, models, disabled, onSave }) {
  const [form,setForm] = useState(row)
  const update = (key,value)=>setForm((current)=>({...current,[key]:value}))
  function save(event) {
    event.preventDefault()
    const payload = {enabled:form.enabled,model_name:form.model_name}
    for (const key of Object.keys(numeric)) payload[key]=form[key]===''||form[key]==null?null:Number(form[key])
    onSave(payload)
  }
  return <form onSubmit={save} className="grid gap-3">
    {!row.connected&&<Alert severity="info">The meal planner uses rules and has no AI provider connection.</Alert>}
    <FormControlLabel label="Enabled" control={<Checkbox checked={Boolean(form.enabled)} disabled={disabled||!row.connected}
      onChange={(event)=>update('enabled',event.target.checked)}/>}/>
    <TextField select label="Approved model" required value={models.includes(form.model_name)?form.model_name:''}
      disabled={disabled} onChange={(event)=>update('model_name',event.target.value)}>
      {models.map((model)=><MenuItem key={model} value={model}>{model}</MenuItem>)}
    </TextField>
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(numeric).map(([key,label])=><TextField key={key} type="number" label={label} value={form[key]??''}
        disabled={disabled} required={key==='temperature'||(key==='max_output_tokens'&&row.feature!=='scan')}
        onChange={(event)=>update(key,event.target.value)} slotProps={{htmlInput:{min:0,step:key.startsWith('price')?0.000001:key==='temperature'?0.001:1}}}/>)}
    </div>
    <p className="text-sm">Leave both prices blank when pricing is unknown. Premium limits are stored for future entitlement support.</p>
    {!disabled&&<Button type="submit" variant="contained">Save settings</Button>}
  </form>
}

export default function AIMonitor({token,permissions}) {
  const canManage=permissions.includes('ai.manage')
  const [tab,setTab]=useState('usage')
  const [feature,setFeature]=useState('chat')
  const [filter,setFilter]=useState({})
  const [feedbackState,setFeedbackState]=useState('')
  const [page,setPage]=useState(0)
  const [size,setSize]=useState(10)
  const [revision,reload]=useState(0)
  const [result,setResult]=useState(null)
  const [editor,setEditor]=useState(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const send=useMemo(()=>(path,method,body)=>aiAdminRequest(token,path,method,body),[token])
  const url=useMemo(()=>{
    let path='/'+tab
    const params=new URLSearchParams()
    if(tab==='usage') {
      for(const [key,value] of Object.entries(filter)) if(value) params.set(key,value)
    }
    if(tab==='prompts'||tab==='feedback') {
      params.set('page',page+1);params.set('page_size',size)
      if(tab==='prompts')path+='/'+feature
      else if(feedbackState)params.set('status',feedbackState)
    }
    return path+(params.size?'?'+params:'')
  },[tab,filter,feature,feedbackState,page,size])
  useEffect(()=>{
    let active=true
    send(url).then((data)=>{if(active)setResult({url,revision,data})})
      .catch((reason)=>{if(active)setResult({url,revision,error:reason.message})})
    return ()=>{active=false}
  },[url,revision,send])
  const current=result?.url===url&&result.revision===revision?result:null
  const data=current?.data??empty
  async function mutate(action) {
    if(busy)return
    setBusy(true);setError('')
    try{await action();setEditor(null);reload((value)=>value+1)}
    catch(reason){setError(reason.message)}
    finally{setBusy(false)}
  }
  function show(row) {
    setError('')
    if(tab==='feedback')send('/feedback/'+row.id).then((detail)=>setEditor({...detail,reviewer_note:detail.reviewer_note??''}))
      .catch((reason)=>setError(reason.message))
    else setEditor(row)
  }
  const cols=tab==='prompts'?
    [{field:'version',headerName:'Version',width:110},{field:'active',headerName:'Status',minWidth:115,renderCell:({value})=>value?'Active':'Inactive'},
      {field:'created_at',headerName:'Created',minWidth:160,flex:1}]:
    [{field:'feature',headerName:'Feature',width:120},{field:'language',headerName:'Language',width:120},
      {field:'status',headerName:'Status',minWidth:130,renderCell:({value})=><AdminStatusChip status={value}/>},
      {field:'shared',headerName:'Content shared',minWidth:130,renderCell:({value})=>value?'Yes':'No'},
      {field:'created_at',headerName:'Date',minWidth:150,flex:1}]
  return <div className="space-y-4">
    <nav aria-label="AI monitoring sections" className="flex flex-wrap gap-2">
      {Object.entries(tabs).map(([id,label])=><Button key={id} variant={tab===id?'contained':'outlined'} aria-pressed={tab===id}
        onClick={()=>{setTab(id);setPage(0);setEditor(null);setError('')}}>{label}</Button>)}
    </nav>
    {current?.error&&<Alert severity="error">{current.error}</Alert>}
    {!editor&&error&&<Alert severity="error">{error}</Alert>}
    {!current&&<p role="status">Loading AI monitoring…</p>}
    {tab==='usage'&&<Usage data={current?.data??(result?.url?.startsWith('/usage')?result.data:null)} filter={filter}
      update={(key,value)=>setFilter((old)=>({...old,[key]:value}))}/>}
    {(tab==='settings'||tab==='prompts')&&<TextField select label="Feature" size="small" value={feature}
      onChange={(event)=>{setFeature(event.target.value);setPage(0)}}>
      {Object.entries(features).map(([id,label])=><MenuItem key={id} value={id}>{label}</MenuItem>)}
    </TextField>}
    {tab==='settings'&&current?.data&&<ConfigForm key={feature+revision} row={data.items.find((r)=>r.feature===feature)}
      models={data.approved_models} disabled={!canManage||busy} onSave={(payload)=>mutate(()=>send('/settings/'+feature,'PUT',payload))}/>}
    {tab==='feedback'&&<TextField select label="Review status" value={feedbackState} size="small"
      onChange={(event)=>{setFeedbackState(event.target.value);setPage(0)}}>
      <MenuItem value="">All statuses</MenuItem>
      {Object.entries(states).map(([id,label])=><MenuItem key={id} value={id}>{label}</MenuItem>)}
    </TextField>}
    {(tab==='prompts'||tab==='feedback')&&<AdminTable key={tab} title={tabs[tab]} columns={cols} rows={data.items} total={data.total}
      page={page} pageSize={size} loading={!current} onPageChange={setPage} onPageSizeChange={(value)=>{setSize(value);setPage(0)}}
      onView={show} onCreate={tab==='prompts'&&canManage&&current?.data?()=>setEditor({system_prompt:''}):undefined} createLabel="New prompt version"/>}
    {editor&&<Dialog open fullWidth maxWidth="md" onClose={()=>{if(!busy)setEditor(null)}}>
      <DialogTitle>{tab==='feedback'?'Feedback review':editor.id?'Prompt version '+editor.version:'New prompt version'}</DialogTitle>
      <DialogContent dividers className="space-y-3">
        {error&&<Alert severity="error">{error}</Alert>}
        {tab==='prompts'?<>
          <Alert severity="info">Active guidance is applied alongside HerBloom’s fixed safety rules.</Alert>
          <TextField fullWidth multiline minRows={5} label="System prompt guidance" disabled={Boolean(editor.id)||busy}
            value={editor.system_prompt} onChange={(event)=>setEditor({...editor,system_prompt:event.target.value})}/>
        </>:<>
          {editor.shared?<div className="space-y-2">
            <p className="whitespace-pre-wrap"><strong>Question:</strong> {editor.question??'A linked question is unavailable for this reply.'}</p>
            <p className="whitespace-pre-wrap"><strong>Answer:</strong> {editor.answer}</p>
          </div>:<Alert severity="info">The mother has not shared the conversation.</Alert>}
          {editor.sources?.length>0&&<ul>{editor.sources.map((s)=><li key={s.article_id}>{s.title}</li>)}</ul>}
          <TextField select label="Status" value={editor.status} disabled={!canManage||busy}
            onChange={(event)=>setEditor({...editor,status:event.target.value})}>
            {Object.entries(states).map(([id,label])=><MenuItem key={id} value={id}>{label}</MenuItem>)}
          </TextField>
          <TextField fullWidth multiline minRows={3} label="Reviewer note" value={editor.reviewer_note} disabled={!canManage||busy}
            onChange={(event)=>setEditor({...editor,reviewer_note:event.target.value})}/>
        </>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={()=>setEditor(null)}>Close</Button>
        {canManage&&tab==='feedback'&&<Button disabled={busy} onClick={()=>mutate(()=>send('/feedback/'+editor.id,'PUT',{
          status:editor.status,reviewer_note:editor.reviewer_note}))}>Save review</Button>}
        {canManage&&tab==='prompts'&&!editor.id&&<Button disabled={busy||!editor.system_prompt.trim()}
          onClick={()=>mutate(()=>send('/prompts/'+feature,'POST',{system_prompt:editor.system_prompt}))}>Create version</Button>}
        {canManage&&tab==='prompts'&&editor.id&&!editor.active&&<Button disabled={busy} onClick={()=>{
          if(window.confirm('Activate this version of the prompt guidance?'))
            mutate(()=>send('/prompts/'+feature+'/'+editor.id+'/activate','POST'))
        }}>Activate this version</Button>}
      </DialogActions>
    </Dialog>}
  </div>
}
