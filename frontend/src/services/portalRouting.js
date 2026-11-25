export function portalRoute(location, portal) {
  if (location.pathname !== portal) return {}
  const query = new URLSearchParams(location.search)
  const article = query.get('article')
  const articleId = article && /^[1-9][0-9]*$/.test(article) ? Number(article) : null
  return {
    page: query.get('page'),
    section: query.get('section'),
    articleId: Number.isSafeInteger(articleId) ? articleId : null,
  }
}

export function portalUrl(location, portal, route) {
  const samePortal = location.pathname === portal
  const query = new URLSearchParams(samePortal ? location.search : '')
  for (const [key, value] of Object.entries({ page: route.page, section: route.section, article: route.articleId })) {
    if (value) query.set(key, String(value))
    else query.delete(key)
  }
  return portal + (query.size ? '?' + query : '') + (samePortal ? location.hash : '')
}
