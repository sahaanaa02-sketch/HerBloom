import { resolveApiBase } from '../../apiConfig.js'

export const apiBase = resolveApiBase(import.meta.env.MODE, import.meta.env.VITE_API_URL)
