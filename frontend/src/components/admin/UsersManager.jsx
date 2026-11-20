import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import AdminTable, { AdminStatusChip } from './AdminTable'
import { usersAdminRequest } from '../../services/adminApi'

const accountFields = {
  display_name: 'Name', email: 'Email', language: 'Language', created_at: 'Joined',
  last_active_at: 'Last active', plan_name: 'Plan', status: 'Status',
}
const requestFields = {
  user_id: 'Mother account ID', type: 'Request', status: 'Status', requested_by: 'Requested by admin ID',
  confirmed_by: 'Confirmed by admin ID', created_at: 'Created', done_at: 'Completed', expires_at: 'Export expiry',
}
const statuses = { active: 'Active', inactive: 'Inactive', anonymized: 'Anonymized' }
const requests = { requested: 'Requested', confirmed: 'Confirmed', done: 'Done', rejected: 'Rejected' }
const empty = { items: [], total: 0 }
const usersFilters = [
  { key: 'status', label: 'Status', options: Object.entries(statuses).map(([value, label]) => ({ value, label })) },
  { key: 'language', label: 'Language', options: [{ value: 'en', label: 'English' }, { value: 'ta', label: 'Tamil' }] },
]
const requestFilters = [
  { key: 'status', label: 'Status', options: Object.entries(requests).map(([value, label]) => ({ value, label })) },
  { key: 'type', label: 'Type', options: [{ value: 'export', label: 'Export' }, { value: 'delete', label: 'Delete' }] },
]
const columns = (labels) => Object.entries(labels).map(([field, headerName]) => ({
  field, headerName, minWidth: 132, flex: 1,
  ...(field === 'status' ? { renderCell: ({ value }) => <AdminStatusChip status={value} /> } : {}),
}))
const accountColumns = columns(accountFields)
const requestColumns = columns(requestFields)

function Fields({ labels, record }) {
  return <dl className="grid gap-3 sm:grid-cols-2">
    {Object.entries(labels).map(([field, label]) => <div key={field}>
      <dt className="font-semibold">{label}</dt><dd className="break-words">{record[field] ?? '—'}</dd>
    </div>)}
  </dl>
}

export default function UsersManager({ token, permissions }) {
  const canManage = permissions.includes('users.manage')
  const canView = permissions.includes('users.view')
  const hasRequests = canManage || permissions.includes('data_requests.confirm')
  const [tab, setTab] = useState(canView ? 'users' : 'data-requests')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({})
  const [revision, refresh] = useState(0)
  const [list, setList] = useState(null)
  const [detail, setDetail] = useState(null)
  const [impact, setImpact] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const send = useCallback((path, method, body, format) => usersAdminRequest(token, path, method, body, format), [token])
  const query = useMemo(() => {
    const values = new URLSearchParams({ page: page + 1, page_size: pageSize })
    if (tab === 'users' && search) values.set('q', search)
    for (const [key, value] of Object.entries(filters)) if (value && value !== 'all') values.set(key, value)
    return '/' + tab + '?' + values
  }, [filters, page, pageSize, search, tab])
  useEffect(() => {
    let active = true
    send(query).then((data) => { if (active) setList({ query, data }) })
      .catch((reason) => { if (active) setList({ query, error: reason.message }) })
    return () => { active = false }
  }, [query, revision, send])
  const onSearch = useCallback((value) => { setSearch(value); setPage(0) }, [])

  function switchTab(next) {
    setTab(next); setPage(0); setFilters({}); setError(''); setMessage('')
  }
  async function open(row) {
    setError(''); setImpact(null); setMessage('')
    try { setDetail(await send('/' + tab + '/' + row.id)) }
    catch (reason) { setError(reason.message) }
  }
  async function operate(operation) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await operation(); refresh((value) => value + 1) }
    catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }
  function accountAction(action, label) {
    if (!window.confirm(label + ' for this mother account?')) return
    operate(async () => {
      await send('/users/' + detail.id + '/' + action, 'POST')
      setDetail(await send('/users/' + detail.id))
      setMessage('Account action completed.')
    })
  }
  function requestData(type) {
    if (!window.confirm('Open a data ' + type + ' request for this account?')) return
    operate(async () => {
      await send('/data-requests', 'POST', { type, user_id: detail.id })
      setMessage('Data request submitted for confirmation.')
    })
  }
  function decide(action) {
    if (!window.confirm(action === 'confirm' ? 'Confirm this data request?' : 'Reject this data request?')) return
    operate(async () => {
      await send('/data-requests/' + detail.id + '/' + action, 'POST')
      setDetail(await send('/data-requests/' + detail.id))
    })
  }
  function download() {
    operate(async () => {
      const path = '/data-requests/' + detail.id
      const grant = await send(path + '/download-ticket', 'POST')
      const blob = await send(path + '/download', 'POST', { token: grant.token }, 'blob')
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = 'herbloom-data-export.zip'
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(href), 1000)
      setMessage('Export downloaded.')
    })
  }

  const current = list?.query === query ? list : null
  const data = current?.data ?? empty
  const isUsers = tab === 'users'
  return <section className="space-y-4">
    <nav aria-label="Users sections" className="flex gap-2">
      {canView && <Button aria-pressed={isUsers} onClick={() => switchTab('users')}>Users</Button>}
      {hasRequests && <Button aria-pressed={!isUsers} onClick={() => switchTab('data-requests')}>Data requests</Button>}
    </nav>
    {current?.error && <Alert severity="error">{current.error}</Alert>}
    {!detail && error && <Alert severity="error">{error}</Alert>}
    <AdminTable key={tab} title={isUsers ? 'Mother accounts' : 'Data requests'} columns={isUsers ? accountColumns : requestColumns}
      rows={data.items} total={data.total} loading={!current} page={page} pageSize={pageSize}
      filters={isUsers ? usersFilters : requestFilters} onFilterChange={(values) => { setFilters(values); setPage(0) }}
      onSearchChange={isUsers ? onSearch : undefined} onPageChange={setPage}
      onPageSizeChange={(value) => { setPageSize(value); setPage(0) }} onView={open}
      onRefresh={() => refresh((value) => value + 1)} />
    {detail && <Dialog open fullWidth maxWidth="md" onClose={() => { if (!busy) setDetail(null) }}>
      <DialogTitle>{isUsers ? 'Mother account' : 'Data request #' + detail.id}</DialogTitle>
      <DialogContent dividers className="space-y-4">
        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        <Fields labels={isUsers ? accountFields : requestFields} record={detail} />
        {isUsers ? <>
          {canManage && detail.status !== 'anonymized' && <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => accountAction(detail.status === 'active' ? 'deactivate' : 'reactivate', detail.status === 'active' ? 'Deactivate account' : 'Reactivate account')}>
              {detail.status === 'active' ? 'Deactivate' : 'Reactivate'}
            </Button>
            <Button disabled={busy || detail.status !== 'active'} onClick={() => accountAction('send-reset', 'Send password reset email')}>Send password reset</Button>
            <Button disabled={busy || detail.status !== 'active'} onClick={() => accountAction('resend-verification', 'Resend verification email')}>Resend verification</Button>
            <Button disabled={busy} onClick={() => requestData('export')}>Request export</Button>
            <Button disabled={busy} onClick={() => requestData('delete')}>Request deletion</Button>
          </div>}
          <h3 className="font-semibold">Administrative history</h3>
          {detail.history.length ? <ul>{detail.history.map((item) => <li key={item.id}>{item.action} · {item.admin_name ?? 'Former admin'} · {item.created_at}</li>)}</ul> : <p>No administrative actions recorded.</p>}
        </> : <>
          {detail.type === 'delete' && <Alert severity="warning">Production deletion execution requires separate authorization.</Alert>}
          <div className="flex flex-wrap gap-2">
            {detail.can_confirm && detail.type === 'delete' && <Button disabled={busy} onClick={() => operate(async () => {
              setImpact(await send('/data-requests/' + detail.id + '/impact'))
            })}>Review deletion impact</Button>}
            {detail.can_confirm && detail.status === 'requested' && <Button disabled={busy || (detail.type === 'delete' && !impact)} onClick={() => decide('confirm')}>Confirm</Button>}
            {detail.can_confirm && ['requested','confirmed'].includes(detail.status) && <Button disabled={busy} onClick={() => decide('reject')}>Reject</Button>}
            {detail.can_download && <Button disabled={busy} onClick={download}>Download export</Button>}
          </div>
          {impact && <div><h3 className="font-semibold">Owned records</h3>
            <ul>{Object.entries(impact.records).map(([name, count]) => <li key={name}>{name.replaceAll('_', ' ')} · {count}</li>)}</ul>
            <p>Private export files · {impact.private_export_files}</p>
          </div>}
        </>}
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setDetail(null)}>Close</Button></DialogActions>
    </Dialog>}
  </section>
}
