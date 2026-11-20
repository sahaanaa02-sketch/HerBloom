
import { useEffect, useMemo, useState } from 'react'
import {
  DataGrid,
  GridActionsCellItem,
} from '@mui/x-data-grid'
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {
  Archive,
  Eye,
  Pencil,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'

const BERRY = '#7B2346'
const BURGUNDY = '#3A1224'
const CREAM = '#FFF6F1'

const DEFAULT_PAGE_SIZE = 10

export default function AdminTable({
  title = 'Records',
  description = '',
  rows = [],
  columns = [],
  total = 0,
  loading = false,

  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,

  onPageChange,
  onPageSizeChange,
  onSearchChange,
  onFilterChange,

  filters = [],

  onView,
  onEdit,
  onArchive,
  onRefresh,
  onCreate,

  createLabel = 'Add New',
  searchPlaceholder = 'Search records...',
  emptyMessage = 'No records found.',

  canCreate = true,
  canEdit = true,
  canEditRow,
  canArchive = true,
}) {
  const [search, setSearch] = useState('')
  const [filterValues, setFilterValues] = useState({})

  useEffect(() => {
    const timeout = setTimeout(() => {
      onSearchChange?.(search.trim())
    }, 400)

    return () => clearTimeout(timeout)
  }, [search, onSearchChange])

  const handleFilterChange = (key, value) => {
    const updated = {
      ...filterValues,
      [key]: value,
    }

    setFilterValues(updated)
    onFilterChange?.(updated)
  }

  const resetFilters = () => {
    setSearch('')
    setFilterValues({})
    onFilterChange?.({})
  }

  const hasActiveFilters =
    search.trim() !== '' ||
    Object.values(filterValues).some(
      (value) => value !== '' && value != null
    )

  const tableColumns = useMemo(() => {
    const result = [...columns]

    const actions = []

    if (onView) {
      actions.push({
        icon: <Eye size={17} />,
        label: 'View',
        handler: onView,
      })
    }

    if (onEdit && canEdit) {
      actions.push({
        icon: <Pencil size={17} />,
        label: 'Edit',
        handler: onEdit,
        visible: canEditRow,
      })
    }

    if (onArchive && canArchive) {
      actions.push({
        icon: <Archive size={17} />,
        label: 'Archive',
        handler: onArchive,
      })
    }

    if (actions.length > 0) {
      result.push({
        field: '__actions',
        type: 'actions',
        headerName: 'Actions',
        width: Math.max(110, actions.length * 48),
        sortable: false,
        filterable: false,
        getActions: (params) =>
          actions.filter((action) => !action.visible || action.visible(params.row)).map((action) => (
            <GridActionsCellItem
              key={action.label}
              icon={action.icon}
              label={action.label}
              onClick={() => action.handler(params.row)}
              showInMenu={false}
              sx={{
                color: BERRY,
                '&:hover': {
                  backgroundColor: '#F6D3DB',
                },
              }}
            />
          )),
      })
    }

    return result
  }, [
    columns,
    onView,
    onEdit,
    onArchive,
    canEdit,
    canEditRow,
    canArchive,
  ])

  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid #EBDDE2',
        borderRadius: '20px',
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
      }}
    >
      {/* Header */}

      <Box
        sx={{
          p: 3,
          borderBottom: '1px solid #F0E5E9',
          backgroundColor: CREAM,
        }}
      >
        <Stack
          direction={{
            xs: 'column',
            md: 'row',
          }}
          justifyContent="space-between"
          alignItems={{
            xs: 'flex-start',
            md: 'center',
          }}
          spacing={2}
        >
          <Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: BURGUNDY,
              }}
            >
              {title}
            </Typography>

            {description && (
              <Typography
                variant="body2"
                sx={{
                  color: '#806A73',
                  mt: 0.5,
                }}
              >
                {description}
              </Typography>
            )}
          </Box>

          <Stack direction="row" spacing={1}>
            {onRefresh && (
              <Button
                variant="outlined"
                onClick={onRefresh}
                disabled={loading}
                startIcon={<RefreshCw size={16} />}
                sx={{
                  borderColor: BERRY,
                  color: BERRY,
                  textTransform: 'none',
                  borderRadius: '10px',
                }}
              >
                Refresh
              </Button>
            )}

            {onCreate && canCreate && (
              <Button
                variant="contained"
                onClick={onCreate}
                sx={{
                  backgroundColor: BERRY,
                  textTransform: 'none',
                  borderRadius: '10px',
                  '&:hover': {
                    backgroundColor: BURGUNDY,
                  },
                }}
              >
                {createLabel}
              </Button>
            )}
          </Stack>
        </Stack>
      </Box>

      {/* Search and Filters */}

      <Box sx={{ p: 2.5 }}>
        <Stack
          direction={{
            xs: 'column',
            md: 'row',
          }}
          spacing={2}
          alignItems={{
            xs: 'stretch',
            md: 'center',
          }}
        >
          <TextField
            size="small"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder={searchPlaceholder}
            sx={{
              minWidth: 250,
              flex: 1,
              '& .MuiOutlinedInput-root': {
                borderRadius: '10px',
              },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={18} color={BERRY} />
                  </InputAdornment>
                ),
              },
            }}
          />

          {filters.map((filter) => (
            <FormControl
              key={filter.key}
              size="small"
              sx={{ minWidth: 160 }}
            >
              <Select
                displayEmpty
                value={filterValues[filter.key] ?? ''}
                onChange={(event) =>
                  handleFilterChange(
                    filter.key,
                    event.target.value
                  )
                }
                sx={{ borderRadius: '10px' }}
              >
                <MenuItem value="">
                  All {filter.label}
                </MenuItem>

                {filter.options.map((option) => (
                  <MenuItem
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ))}

          {hasActiveFilters && (
            <Button
              onClick={resetFilters}
              startIcon={<X size={15} />}
              sx={{
                color: BERRY,
                textTransform: 'none',
              }}
            >
              Clear
            </Button>
          )}
        </Stack>
      </Box>

      {/* DataGrid */}

      <Box sx={{ width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={tableColumns}
          loading={loading}
          rowCount={total}
          paginationMode="server"
          paginationModel={{
            page,
            pageSize,
          }}
          onPaginationModelChange={(model) => {
            if (model.pageSize !== pageSize) {
              onPageSizeChange?.(model.pageSize)
            } else if (model.page !== page) {
              onPageChange?.(model.page)
            }
          }}
          pageSizeOptions={[5, 10, 20, 50]}
          disableRowSelectionOnClick
          autoHeight
          slots={{
            noRowsOverlay: () => (
              <Box
                sx={{
                  py: 6,
                  textAlign: 'center',
                  color: '#806A73',
                }}
              >
                {emptyMessage}
              </Box>
            ),
          }}
          sx={{
            border: 'none',

            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: CREAM,
              color: BURGUNDY,
              fontWeight: 700,
            },

            '& .MuiDataGrid-columnHeaderTitle': {
              fontWeight: 700,
            },

            '& .MuiDataGrid-row:hover': {
              backgroundColor: '#FFF6F8',
            },

            '& .MuiDataGrid-cell': {
              borderColor: '#F3E9ED',
            },

            '& .MuiDataGrid-footerContainer': {
              borderColor: '#F0E5E9',
            },

            '& .MuiTablePagination-root': {
              color: BURGUNDY,
            },
          }}
        />
      </Box>
    </Paper>
  )
}


// ==========================================
// Reusable Status Chip
// ==========================================

export function AdminStatusChip({
  status = 'draft',
}) {
  const normalized = String(status).toLowerCase()

  const styles = {
    draft: {
      bg: '#F2EDF0',
      color: '#695560',
    },
    pending_review: {
      bg: '#FFF1D6',
      color: '#966315',
    },
    in_review: {
      bg: '#FFF1D6',
      color: '#966315',
    },
    approved: {
      bg: '#E2F3E8',
      color: '#267245',
    },
    published: {
      bg: '#E2F3E8',
      color: '#267245',
    },
    active: {
      bg: '#E2F3E8',
      color: '#267245',
    },
    archived: {
      bg: '#F4E3E8',
      color: '#8A3853',
    },
    rejected: {
      bg: '#FCE8E8',
      color: '#A13E3E',
    },
  }

  const selected = styles[normalized] || styles.draft

  return (
    <Chip
      size="small"
      label={normalized.replaceAll('_', ' ')}
      sx={{
        backgroundColor: selected.bg,
        color: selected.color,
        fontWeight: 600,
        textTransform: 'capitalize',
        borderRadius: '8px',
      }}
    />
  )
}
