/** Route Admin candidates through the dedicated backend authentication endpoint. */
export async function resolveSharedLogin(motherResponse, allowAdmin, startAdmin) {
  if (allowAdmin && motherResponse.status === 401) {
    return startAdmin()
  }

  const data = await motherResponse.json()
  if (!motherResponse.ok) {
    throw Object.assign(new Error(typeof data.detail === 'string' ? data.detail : ''), { status: motherResponse.status })
  }

  const role = data?.user?.role
  const hasToken = typeof data?.access_token === 'string' && data.access_token.trim() !== ''
  if (allowAdmin && role === 'ADMIN' && hasToken) {
    // Older shared login responses can identify staff. Never use that token.
    return startAdmin()
  }

  return requireMotherSession(data)
}

function requireMotherSession(data) {
  if (data?.user?.role !== 'MOTHER' || typeof data.access_token !== 'string' || !data.access_token.trim()) {
    throw new Error('Invalid account sign-in response. Please try again.')
  }
  return { mother: data }
}
