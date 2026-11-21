import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Alert, Button } from '@mui/material'
import { getAdminMedia, getAdminMediaImage } from '../../services/adminApi'

export function AdminMediaImage({ token, mediaId, legacyUrl }) {
  const { t: uiText } = useTranslation('common')
  const [source, setSource] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!mediaId) return
    let active = true
    let url
    getAdminMediaImage(token, mediaId).then((blob) => {
      if (active) {
        url = URL.createObjectURL(blob)
        setSource(url)
      }
    }).catch(() => { if (active) setFailed(true) })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [mediaId, token])
  const safeLegacy = /^https?:\/\/[^\s]+$/i.test(legacyUrl || '') ? legacyUrl : ''
  const image = mediaId ? source : safeLegacy
  if (failed) return <p role="status">{uiText('image_unavailable')}</p>
  return image ? <img src={image} alt="" referrerPolicy="no-referrer" className="max-h-60 w-full rounded-xl object-cover" /> : null
}

export function MediaPicker({ token, onSelect, mediaType }) {
  const { t: uiText } = useTranslation('common')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    getAdminMedia(token, { page, mediaType, status: 'active' })
      .then((data) => { if (active) setResult(data) })
      .catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [page, token, mediaType])
  const move = (delta) => {
    setResult(null)
    setError('')
    setPage((value) => value + delta)
  }
  return (
    <div className="space-y-2 rounded-lg border border-[#F6D3DB] p-3">
      {error && <Alert severity="error">{error}</Alert>}
      {!result && !error && <p role="status">{uiText('loading_media')}</p>}
      {result?.total === 0 && <p>{uiText('no_matching_active_files_in_the_media_library')}</p>}
      {result?.items.map((image) => (
        <Button key={image.id} onClick={() => onSelect(image.id)}>{image.original_filename}</Button>
      ))}
      {result && (
        <div>
          <Button disabled={page === 1} onClick={() => move(-1)}>{uiText('previous_files')}</Button>
          <Button disabled={page * 10 >= result.total} onClick={() => move(1)}>{uiText('next_files')}</Button>
        </div>
      )}
    </div>
  )
}


export function ImagePicker(props) {
  return <MediaPicker {...props} mediaType="image" />
}
