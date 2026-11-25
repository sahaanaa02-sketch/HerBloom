// The backend challenge lives for five minutes. Leave time for the provider round trip.
const challengeLifetime = 4 * 60 * 1000
const activeSessions = new WeakMap()

export function createGoogleButtonSession(load, now = Date.now) {
  let pending
  let current

  return function getSession() {
    if (current?.isUsable()) return Promise.resolve(current)
    if (pending) return pending

    const expiresAt = now() + challengeLifetime
    pending = load().then(({ provider, result }) => {
      let listener
      let used = false
      const session = {
        provider,
        isUsable: () => !used && activeSessions.get(provider) === session && now() < expiresAt,
        attach(onCredential, onExpired) {
          const subscription = { onCredential, onExpired }
          listener = subscription
          return () => {
            if (listener === subscription) listener = undefined
          }
        },
      }
      provider.initialize({
        client_id: result.client_id,
        nonce: result.nonce,
        ux_mode: 'popup',
        auto_select: false,
        use_fedcm_for_button: true,
        callback(credential) {
          if (!listener || used || activeSessions.get(provider) !== session) return
          if (!session.isUsable()) return listener.onExpired()
          used = true
          return listener.onCredential(credential, result.challenge)
        },
      })
      activeSessions.set(provider, session)
      current = session
      return session
    }).finally(() => { pending = undefined })
    return pending
  }
}
