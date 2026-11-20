import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import AdminTable, { AdminStatusChip } from './AdminTable'
import { nutritionAdminRequest as request } from '../../services/adminApi'

const units = {
  calories: ['Energy', 'kcal'], protein: ['Protein', 'g'], carbs_g: ['Carbohydrate', 'g'],
  fat_g: ['Fat', 'g'], fibre_g: ['Fibre', 'g'], iron: ['Iron', 'mg'], calcium: ['Calcium', 'mg'],
  folate_ug: ['Folate', 'µg'], vitamin_c_mg: ['Vitamin C', 'mg'],
}
const apiUnits = { folate_ug: 'ug' }
const groups = { breastfeeding: 'Breastfeeding', not_breastfeeding: 'Not breastfeeding' }
const sources = { usda: 'USDA', sl_fcdb: 'Sri Lankan FCDB', custom: 'Custom' }
const languages = { en: 'English', ta: 'Tamil', local: 'Local spelling' }
const input = 'mt-1 w-full rounded-lg border border-[#F6D3DB] bg-white px-3 py-2 text-[#3A1224]'
const blankFood = { name_en: '', name_ta: '', category: 'other', source: 'custom', source_ref: '', tags: [] }
const empty = { items: [], total: 0 }
const draftColumns = [
  { field: 'name_en', headerName: 'English food name', minWidth: 175, flex: 1 },
  { field: 'name_ta', headerName: 'Tamil food name', minWidth: 145, flex: 1 },
  { field: 'category', headerName: 'Category', minWidth: 110 },
  { field: 'source', headerName: 'Source', minWidth: 140, renderCell: ({ value }) => (
    <span className="rounded-full bg-[#FFF0F3] px-3 py-1 text-xs">{sources[value] ?? value}</span>
  ) },
  { field: 'verified', headerName: 'Verification', minWidth: 110, valueFormatter: (value) => value ? 'Verified' : 'Unverified' },
  ...Object.entries(units).map(([field, [label, unit]]) => ({ field, headerName: label + ' (' + unit + ')', minWidth: 105 })),
]
const unmatchedColumns = [
  { field: 'name', headerName: 'Scanner name', minWidth: 220, flex: 1 },
  { field: 'count', headerName: 'Count', minWidth: 85 },
  { field: 'last_seen', headerName: 'Last seen', minWidth: 180 },
]
const targetColumns = [
  { field: 'feeding_group', headerName: 'Group', minWidth: 160, valueFormatter: (value) => groups[value] },
  { field: 'nutrient', headerName: 'Nutrient', minWidth: 130, valueFormatter: (value) => units[value]?.[0] },
  { field: 'value', headerName: 'Daily value', minWidth: 100 },
  { field: 'unit', headerName: 'Unit', minWidth: 75 },
  { field: 'source_note', headerName: 'Source note', minWidth: 200, flex: 1 },
  { field: 'status', headerName: 'Status', minWidth: 125, renderCell: ({ value }) => <AdminStatusChip status={value} /> },
]

function TextField({ label, value, onChange, ...props }) {
  return <label className="block">{label}<input className={input} value={value ?? ''} onChange={(event) => onChange(event.target.value)} {...props} /></label>
}

function SelectField({ label, value, onChange, options, disabled }) {
  return <label className="block">{label}
    <select className={input} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {Object.entries(options).map(([key, text]) => <option value={key} key={key}>{text}</option>)}
    </select>
  </label>
}

function CatalogSearch({ run, title, render, busy }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function search() {
    setLoading(true)
    setError('')
    try { setResults(await run(query.trim())) }
    catch (reason) { setResults(null); setError(reason.message) }
    finally { setLoading(false) }
  }
  return <section className="space-y-3">
    <div className="flex items-end gap-2">
      <div className="flex-1"><TextField label={title} value={query} onChange={setQuery} maxLength={120} /></div>
      <Button disabled={busy || loading || !query.trim()} onClick={search}>Search</Button>
    </div>
    {error && <Alert severity="error">{error}</Alert>}
    {results && (results.length ? <ul className="max-h-72 space-y-1 overflow-auto">{results.map(render)}</ul> : <p>No foods found.</p>)}
  </section>
}

function FoodEditor({ record, unmatched, canEdit, token, execute }) {
  const [data, setData] = useState(() => ({ ...blankFood, ...record, name_en: record?.name_en ?? unmatched?.name ?? '' }))
  const [tags, setTags] = useState((record?.tags ?? []).join(', '))
  const [aliases, setAliases] = useState(record?.aliases ?? [])
  const [alias, setAlias] = useState({ alias: '', lang: 'local' })
  const locked = Boolean(record?.verified || record?.source === 'usda')
  const readOnly = Boolean(record && !canEdit)
  const set = (key) => (value) => setData((current) => ({ ...current, [key]: value }))
  const path = record ? '/foods/' + record.id : unmatched ? '/unmatched-foods/' + unmatched.id + '/create' : '/foods'
  function save(event) {
    event.preventDefault()
    const labels = { name_ta: data.name_ta, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) }
    const payload = locked ? labels : {
      ...labels, name_en: data.name_en, category: data.category, source: data.source === "sl_fcdb" ? "sl_fcdb" : "custom", source_ref: data.source_ref || null,
      ...Object.fromEntries(Object.keys(units).map((key) => [key, data[key] === '' || data[key] == null ? null : Number(data[key])])),
    }
    execute(() => request(token, path, record ? 'PUT' : 'POST', payload))
  }
  async function saveAlias() {
    const path = '/foods/' + record.id + '/aliases' + (alias.id ? '/' + alias.id : '')
    await request(token, path, alias.id ? 'PUT' : 'POST', { alias: alias.alias, lang: alias.lang })
    setAliases((await request(token, '/foods/' + record.id)).aliases)
    setAlias({ alias: '', lang: 'local' })
  }
  return <div className="space-y-5">
    <form onSubmit={save} className="space-y-3">
      {locked && <Alert severity="info">Source and nutrient values are protected. Tamil name and tags can be edited.</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="English name" value={data.name_en} onChange={set('name_en')} disabled={locked || readOnly} required maxLength={150} />
        <TextField label="Tamil name" value={data.name_ta} onChange={set('name_ta')} disabled={readOnly} maxLength={150} />
        <TextField label="Category" value={data.category} onChange={set('category')} disabled={locked || readOnly} required maxLength={60} />
        <SelectField label="Source" options={{ custom:'Custom', sl_fcdb:'Sri Lankan FCDB', ...(locked ? { [data.source]:sources[data.source] ?? data.source } : {}) }}
          value={data.source in sources || locked ? data.source : 'custom'} onChange={set('source')} disabled={locked || readOnly} />
        <TextField label="Source reference" value={data.source_ref} onChange={set('source_ref')} disabled={locked || readOnly} maxLength={250} />
        <TextField label="Tags (comma-separated)" value={tags} onChange={setTags} disabled={readOnly} />
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-3" disabled={locked || readOnly}>
        <legend className="font-semibold">Nutrients per 100 g</legend>
        {Object.entries(units).map(([key, [label, unit]]) => <TextField key={key} label={label + ' (' + unit + ')'}
          type="number" min={0} step="any" value={data[key]} onChange={set(key)} />)}
      </fieldset>
      {!readOnly && <Button type="submit" variant="contained">Save food</Button>}
    </form>
    {record && <section className="space-y-2 border-t border-[#F6D3DB] pt-4">
      <h3 className="font-semibold">Aliases</h3>
      {!aliases.length && <p>No aliases recorded.</p>}
      {aliases.map((row) => <div key={row.id} className="flex items-center gap-2">
        <span className="flex-1">{row.alias} · {languages[row.lang] ?? 'Legacy'}</span>
        {canEdit && <><Button onClick={() => setAlias({ ...row, lang: row.lang || 'local' })}>Edit alias</Button>
          <Button onClick={() => {
            if (window.confirm('Delete this alias?')) execute(async () => {
              await request(token, '/foods/' + record.id + '/aliases/' + row.id, 'DELETE')
              setAliases((current) => current.filter((item) => item.id !== row.id))
            }, false)
          }}>Delete alias</Button></>}
      </div>)}
      {canEdit && <div className="grid items-end gap-2 sm:grid-cols-3">
        <TextField label="Alias spelling" value={alias.alias} onChange={(value) => setAlias({ ...alias, alias: value })} maxLength={150} />
        <SelectField label="Language" value={alias.lang} onChange={(lang) => setAlias({ ...alias, lang })} options={languages} />
        <Button disabled={!alias.alias.trim()} onClick={() => execute(saveAlias, false)}>Save alias</Button>
      </div>}
    </section>}
  </div>
}

function TargetEditor({ record, token, execute }) {
  const [data, setData] = useState(record ?? { feeding_group: 'breastfeeding', nutrient: 'calories', value: '', source_note: '' })
  const set = (key) => (value) => setData((current) => ({ ...current, [key]: value }))
  return <form className="space-y-3" onSubmit={(event) => {
    event.preventDefault()
    const payload = { feeding_group: data.feeding_group, nutrient: data.nutrient, value: Number(data.value),
      unit: apiUnits[data.nutrient] ?? units[data.nutrient][1], source_note: data.source_note }
    execute(() => request(token, '/nutrition-targets' + (record ? '/' + record.id : ''), record ? 'PUT' : 'POST', payload))
  }}>
    <SelectField label="Group" value={data.feeding_group} onChange={set('feeding_group')} options={groups} disabled={Boolean(record)} />
    <SelectField label="Nutrient" value={data.nutrient} onChange={set('nutrient')}
      options={Object.fromEntries(Object.entries(units).map(([key, [label]]) => [key,label]))} disabled={Boolean(record)} />
    <TextField label={'Daily value (' + units[data.nutrient][1] + ')'} value={data.value} onChange={set('value')} type="number" min={0} step="any" required />
    <TextField label="Source note" value={data.source_note} onChange={set('source_note')} maxLength={1000} required />
    <Button type="submit" variant="contained">Save draft</Button>
  </form>
}

function CsvImport({ token, execute }) {
  const [file,setFile] = useState(null)
  const [report,setReport] = useState(null)
  async function upload(dryRun) {
    const body = new FormData()
    body.append('file', file)
    const result = await request(token, '/foods/csv?dry_run=' + dryRun, 'POST', body)
    setReport(result)
    return result.imported
  }
  async function download() {
    const blob = await request(token, '/foods/csv-template', 'GET', null, 'blob')
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'herbloom-foods.csv'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return <div className="space-y-3">
    <Button onClick={() => execute(download, false)}>Download template</Button>
    <label className="block">CSV file<input className={input} type="file" accept=".csv,text/csv"
      onChange={(event) => { setFile(event.target.files?.[0]); setReport(null) }} /></label>
    <p className="text-sm">Use UTF-8. Separate tags with a vertical bar. Leave unknown nutrients blank.</p>
    <Button disabled={!file} onClick={() => execute(() => upload(true), false)}>Validate</Button>
    <Button disabled={!file || !report || report.errors.length > 0 || report.imported > 0}
      onClick={() => execute(() => upload(false), false)}>Import valid file</Button>
    {report && <div aria-live="polite" className="space-y-1">
      <p>{report.valid_rows} valid rows. {report.imported} imported.</p>
      {report.errors.map((row,index) => <p key={index} className="text-[#7B2346]">Line {row.line}: {row.message}</p>)}
    </div>}
  </div>
}

export default function NutritionDataManager({ token, permissions }) {
  const [tab, setTab] = useState('foods')
  const [page,setPage] = useState(0)
  const [pageSize,setSize] = useState(10)
  const [search,setSearch] = useState('')
  const [revision,setRevision] = useState(0)
  const [result,setResult] = useState(null)
  const [error,setError] = useState('')
  const [detail,setDetail] = useState(null)
  const [busy,setBusy] = useState(false)
  const can = (key) => permissions.includes('nutrition.' + key)
  const readable = can('view')
  const onSearch = useCallback((value) => { setSearch(value); setPage(0) }, [])
  const query = useMemo(() => ({ revision, tab, page, pageSize, search }),[revision,tab,page,pageSize,search])
  const current = result?.query === query ? result : null

  useEffect(() => {
    if (!readable) return
    let active = true
    const params = new URLSearchParams({ page: String(query.page + 1), page_size: String(query.pageSize), q: query.search })
    const path = query.tab === 'targets' ? '/nutrition-targets' : query.tab === 'unmatched' ? '/unmatched-foods?' + params : '/foods?' + params
    request(token,path).then((payload) => {
      if (active) setResult({ query, data: Array.isArray(payload) ? { items: payload, total: payload.length } : payload })
    }).catch((reason) => { if (active) setResult({ query, error: reason.message }) })
    return () => { active = false }
  },[query,readable,token])

  async function execute(operation, close = true) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await operation()
      if (close) setDetail(null)
      setRevision((value) => value+1)
    } catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }

  function openFood(row) {
    execute(async () => setDetail({ mode:'food', record:await request(token,'/foods/' + row.id) }),false)
  }

  if (!readable) return <Alert severity="warning">Nutrition viewing permission is required.</Alert>
  const { items,total } = current?.data ?? empty
  const target = detail?.record
  return <>
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="Nutrition data sections">
      {[['foods','Foods'],['unmatched','Unmatched scanner names'],['targets','Nutrition targets']].map(([id,label]) => (
        <button key={id} type="button" aria-pressed={tab===id}
          className={'rounded-full border border-[#F6D3DB] px-4 py-2 text-sm font-semibold ' + (tab===id?'bg-[#7B2346] text-white':'bg-white text-[#7B2346]')}
          onClick={() => { setTab(id); setPage(0); setSearch(''); setError('') }}>{label}</button>
      ))}
    </nav>
    {!detail && (current?.error || error) && <Alert severity="error">{current?.error || error}</Alert>}
    {tab==='foods' && !current?.error && can('create') && <div className="mb-3 flex gap-2">
      <Button onClick={() => setDetail({mode:'usda'})}>Import from USDA</Button>
      <Button onClick={() => setDetail({mode:'csv'})}>CSV import</Button>
    </div>}
    <AdminTable key={tab} title={tab==='foods'?'Foods per 100 g':tab==='targets'?'Nutrition targets':'Unmatched scanner names'}
      columns={tab==='foods'?draftColumns:tab==='targets'?targetColumns:unmatchedColumns}
      rows={tab === 'targets' ? items.slice(page * pageSize, (page + 1) * pageSize) : items} total={total} loading={!current || busy} page={page} pageSize={pageSize}
      onPageChange={setPage} onPageSizeChange={(size) => {setSize(size);setPage(0)}}
      onSearchChange={tab==='foods'?onSearch:undefined}
      onRefresh={() => setRevision((value) => value+1)}
      onView={tab==='foods'?openFood:tab==='unmatched'?(row) => setDetail({mode:'map',record:row}):(row) => setDetail({mode:'targetActions',record:row})}
      onCreate={tab!=='unmatched' && can('create') && !current?.error ? () => setDetail({mode:tab==='foods'?'food':'target'}) : undefined}
      createLabel={tab==='foods'?'New food':'New target'}
    />
    {detail && <Dialog open fullWidth maxWidth="md" onClose={() => { if(!busy){setDetail(null);setError('')} }}>
      <DialogTitle>{{food:'Food details', map:'Resolve scanner name', usda:'Import from USDA', csv:'CSV import',
        target:'Nutrition target draft', targetActions:'Nutrition target details'}[detail.mode]}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error">{error}</Alert>}
        <fieldset disabled={busy} className="space-y-3">
          {detail.mode==='food' && <FoodEditor record={target} unmatched={detail.unmatched} canEdit={can('edit')} token={token} execute={execute} />}
          {detail.mode==='food' && target && can('delete') && !target.verified &&
            <Button color="error" onClick={() => {
              if(window.confirm('Delete this unverified food? Referenced foods cannot be deleted.')) execute(() => request(token,'/foods/'+target.id,'DELETE'))
            }}>Delete food</Button>}
          {detail.mode==='map' && <>
            <p className="font-semibold">{target.name}</p>
            {can('edit') && <CatalogSearch title="Find an existing food" busy={busy}
              run={async(q) => (await request(token,'/foods?'+new URLSearchParams({q,page_size:'20'}))).items}
              render={(food) => <li key={food.id}><Button onClick={() => execute(() =>
                request(token,'/unmatched-foods/'+target.id+'/map','POST',{food_id:food.id}))}>Map to {food.name_en}</Button></li>} />}
            {can('create') && <Button onClick={() => setDetail({mode:'food',unmatched:target})}>Create food from name</Button>}
          </>}
          {detail.mode==='usda' && <CatalogSearch title="USDA FoodData Central" busy={busy}
            run={(q) => request(token,'/usda/search?'+new URLSearchParams({q}))
            }
            render={(food) => <li key={food.fdcId} className="flex items-center justify-between gap-2">
              <span>{food.description} · {food.dataType}</span><Button onClick={() => execute(() =>
                request(token,'/usda/import','POST',{fdcId:food.fdcId}))}>Import</Button>
            </li>} />}
          {detail.mode==='csv' && <CsvImport token={token} execute={execute} />}
          {detail.mode==='target' && <TargetEditor record={target} token={token} execute={execute} />}
          {detail.mode==='targetActions' && <>
            <p>{groups[target.feeding_group]} · {units[target.nutrient]?.[0]} · {target.value} {target.unit}</p>
            <p className="whitespace-pre-wrap">{target.source_note}</p>
            <AdminStatusChip status={target.status} />
            <div className="flex flex-wrap gap-2">
              {can('edit') && target.status!=='in_review' && <Button onClick={() => setDetail({mode:'target',record:target})}>Edit target</Button>}
              {can('edit') && target.status==='draft' && <Button onClick={() => execute(() =>
                request(token,'/nutrition-targets/'+target.id+'/submit','POST'))}>Submit for review</Button>}
              {target.status === 'in_review' && <Alert severity="info">Review decisions and publishing are handled in Clinical Review.</Alert>}
            </div>
          </>}
        </fieldset>
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => {setDetail(null);setError('')}}>Close</Button></DialogActions>
    </Dialog>}
  </>
}
