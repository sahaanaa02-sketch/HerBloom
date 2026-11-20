
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'

import AdminTable, {
  AdminStatusChip,
} from '../../components/admin/AdminTable'

import {
  getAdminMedia,
  uploadAdminMedia,
  archiveAdminMedia,
} from '../../services/adminApi'


export default function MediaLibrary({
  token,
  permissions = [],
  isSuperAdmin = false,
}) {
  const fileInputRef = useRef(null)

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({})

  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [uploading, setUploading] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [archiving, setArchiving] = useState(false)

  const can = useCallback(
    (permission) =>
      isSuperAdmin || permissions.includes(permission),
    [isSuperAdmin, permissions]
  )

  const canUpload = can('media.upload')
  const canArchive = can('media.delete')

  useEffect(() => {
    if (!token) return

    let cancelled = false

    async function loadMedia() {
      setLoading(true)
      setError('')

      try {
        const result = await getAdminMedia(token, {
          page: page + 1,
          pageSize,
          search,
          mediaType: filters.media_type || '',
          status: filters.status || '',
        })

        if (!cancelled) {
          setRows(result.items || [])
          setTotal(result.total || 0)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load media.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadMedia()

    return () => {
      cancelled = true
    }
  }, [
    token,
    page,
    pageSize,
    search,
    filters,
    refreshKey,
  ])

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]

    if (!file) return

    setError('')
    setSuccess('')

    const extension = file.name
      .split('.')
      .pop()
      ?.toLowerCase()

    const imageTypes = ['jpg', 'jpeg', 'png', 'webp']
    const audioTypes = ['mp3', 'm4a']

    if (
      !imageTypes.includes(extension) &&
      !audioTypes.includes(extension)
    ) {
      setError('Unsupported file format.')
      event.target.value = ''
      return
    }

    const maxSize = imageTypes.includes(extension)
      ? 2 * 1024 * 1024
      : 10 * 1024 * 1024

    if (file.size > maxSize) {
      setError('Selected file exceeds the allowed size.')
      event.target.value = ''
      return
    }

    setUploading(true)

    try {
      await uploadAdminMedia(token, file)

      setSuccess('Media uploaded successfully.')
      setPage(0)
      setRefreshKey((value) => value + 1)
    } catch (err) {
      setError(err.message || 'Upload failed.')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const handleArchive = async () => {
    if (!archiveTarget) return

    setArchiving(true)
    setError('')
    setSuccess('')

    try {
      await archiveAdminMedia(
        token,
        archiveTarget.id
      )

      setSuccess('Media archived successfully.')
      setArchiveTarget(null)
      setRefreshKey((value) => value + 1)
    } catch (err) {
      setError(err.message || 'Archive failed.')
    } finally {
      setArchiving(false)
    }
  }

  const columns = [
    {
      field: 'id',
      headerName: 'ID',
      width: 75,
    },
    {
      field: 'original_filename',
      headerName: 'File Name',
      flex: 1,
      minWidth: 220,
    },
    {
      field: 'media_type',
      headerName: 'Type',
      width: 110,
    },
    {
      field: 'file_size',
      headerName: 'Size',
      width: 120,
      valueFormatter: (value) =>
        typeof value === 'number'
          ? `${(value / 1024).toFixed(1)} KB`
          : '—',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: (params) => (
        <AdminStatusChip status={params.value} />
      ),
    },
    {
      field: 'created_at',
      headerName: 'Uploaded',
      width: 180,
      valueFormatter: (value) =>
        value
          ? new Date(value).toLocaleString()
          : '—',
    },
  ]

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.mp3,.m4a"
        hidden
        onChange={handleUpload}
      />

      <AdminTable
        title="Media Library"
        description="Manage uploaded images and audio files."
        rows={rows}
        columns={columns}
        total={total}
        loading={loading}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(value) => {
          setPageSize(value)
          setPage(0)
        }}
        onSearchChange={useCallback((value) => {
          setSearch(value)
          setPage(0)
        }, [])}
        onFilterChange={useCallback((value) => {
          setFilters(value)
          setPage(0)
        }, [])}
        filters={[
          {
            key: 'media_type',
            label: 'Types',
            options: [
              { label: 'Images', value: 'image' },
              { label: 'Audio', value: 'audio' },
            ],
          },
          {
            key: 'status',
            label: 'Statuses',
            options: [
              { label: 'Active', value: 'active' },
              { label: 'Archived', value: 'archived' },
            ],
          },
        ]}
        onRefresh={() =>
          setRefreshKey((value) => value + 1)
        }
        onCreate={
          canUpload
            ? () => fileInputRef.current?.click()
            : undefined
        }
        createLabel={
          uploading ? 'Uploading...' : 'Upload Media'
        }
        canCreate={canUpload && !uploading}
        canEdit={false}
        canArchive={canArchive}
        onArchive={
          canArchive
            ? (row) => {
                if (row.status === 'archived') {
                  setError('This file is already archived.')
                  return
                }
                setArchiveTarget(row)
              }
            : undefined
        }
      />

      {uploading && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 2,
          }}
        >
          <CircularProgress size={18} />
          <Typography variant="body2">
            Uploading media...
          </Typography>
        </Box>
      )}

      <Dialog
        open={Boolean(archiveTarget)}
        onClose={() => {
          if (!archiving) setArchiveTarget(null)
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Archive Media?</DialogTitle>

        <DialogContent>
          <Typography>
            Archive{' '}
            <strong>
              {archiveTarget?.original_filename}
            </strong>
            ?
          </Typography>

          <Typography
            variant="body2"
            sx={{ mt: 1, color: 'text.secondary' }}
          >
            This file will no longer be available
            through the active media endpoint.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button
            disabled={archiving}
            onClick={() => setArchiveTarget(null)}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            color="error"
            disabled={archiving}
            onClick={handleArchive}
          >
            {archiving ? 'Archiving...' : 'Archive'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
