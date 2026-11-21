const mediaErrorKeys = new Map([
  [
    "Unsupported file format.",
    "unsupported_file_format"
  ],
  [
    "Unsupported file type.",
    "unsupported_file_format"
  ],
  [
    "Selected file exceeds the allowed size.",
    "selected_file_exceeds_the_allowed_size"
  ],
  [
    "File exceeds allowed size.",
    "selected_file_exceeds_the_allowed_size"
  ],
  [
    "This file is already archived.",
    "this_file_is_already_archived"
  ],
  [
    "Media file is already archived.",
    "this_file_is_already_archived"
  ],
  [
    "Invalid file content.",
    "invalid_media_content"
  ],
  [
    "Media file not found.",
    "media_not_found"
  ],
  [
    "Stored file not found.",
    "media_not_found"
  ],
  [
    "Failed to load media.",
    "failed_to_load_media"
  ],
  [
    "Upload failed.",
    "upload_failed"
  ],
  [
    "Archive failed.",
    "archive_failed"
  ]
])

export function mediaErrorKey(message, fallback = 'media_request_failed') {
  return mediaErrorKeys.get(message) ?? fallback
}
