import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@babel/parser'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const sourceRoot = join(frontend, 'src')
const visibleAttributes = new Set(['alt', 'aria-label', 'aria-description', 'label', 'placeholder',
  'title', 'helper', 'helperText', 'description', 'emptyMessage', 'createLabel', 'searchPlaceholder',
  'headerName', 'loadingText', 'noOptionsText', 'subtitle'])
const visibleProperties = new Set(['headerName', 'label', 'placeholder', 'helperText', 'emptyMessage'])

export function walk(node, ancestors, visit) {
  if (!node?.type) return
  visit(node, ancestors)
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'extra', 'comments', 'tokens'].includes(key)) continue
    if (Array.isArray(value)) value.forEach(child => walk(child, [...ancestors, node], visit))
    else walk(value, [...ancestors, node], visit)
  }
}

export function sourceUnits() {
  return readdirSync(sourceRoot, { recursive: true })
    .filter(path => /\.(jsx?|tsx?|json|css)$/.test(path) && !path.includes('.backup-'))
    .sort().map(path => {
      const fullPath = join(sourceRoot, path)
      const source = readFileSync(fullPath, 'utf8')
      const file = ('frontend/' + relative(frontend, fullPath)).replaceAll('\\', '/')
      const ast = /\.[jt]sx?$/.test(path)
        ? parse(source, { sourceType: 'module', plugins: ['jsx', ...(path.endsWith('.ts') || path.endsWith('.tsx') ? ['typescript'] : [])] })
        : null
      return { file, source, ast }
    })
}

const expressionWrappers = new Set(['ConditionalExpression', 'LogicalExpression', 'ParenthesizedExpression'])
const feedbackCalls = new Set(['setError', 'setMessage', 'setNotice', 'setSuccess', 'alert', 'confirm'])

function contextFor(node, ancestors) {
  if (node.type === 'JSXText') return 'visible text'
  let i = ancestors.length - 1
  let child = node
  while (expressionWrappers.has(ancestors[i]?.type)) {
    if (ancestors[i].test === child || (ancestors[i].type === 'LogicalExpression' && ancestors[i].left === child)) return null
    child = ancestors[i--]
  }
  const parent = ancestors[i]
  if (parent?.type === 'JSXExpressionContainer' || parent?.type === 'JSXAttribute') {
    const attr = parent.type === 'JSXAttribute' ? parent : ancestors[i - 1]
    if (attr?.type === 'JSXAttribute') return visibleAttributes.has(attr.name.name) ? attr.name.name : null
    return 'visible text'
  }
  if (parent?.type === 'ObjectProperty' && parent.value === child) {
    const key = parent.key.name ?? parent.key.value
    return visibleProperties.has(key) ? key : null
  }
  if (parent?.type === 'CallExpression' && parent.arguments.includes(child)) {
    const name = parent.callee.name ?? parent.callee.property?.name
    return feedbackCalls.has(name) ? name : null
  }
  return null
}

function componentFor(ancestors) {
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const node = ancestors[index]
    if (node.type === 'FunctionDeclaration' && /^[A-Z]/.test(node.id?.name)) return node.id.name
    const declarator = ancestors[index - 1]
    if (node.type === 'ArrowFunctionExpression' && declarator?.type === 'VariableDeclarator'
      && /^[A-Z]/.test(declarator.id.name)) return declarator.id.name
  }
  return '(module)'
}

export function namespaceFor(file) {
  if (/onboarding/i.test(file)) return 'onboarding'
  if (/LandingPage/i.test(file)) return 'landing'
  if (/Login|Auth|AccountRecovery|GoogleSignIn|AdminVerification|AdminInviteSetup/i.test(file)) return 'auth'
  if (/\/(?:pages|components)\/admin\//i.test(file)) return 'admin'
  if (/\/(?:mother|dashboard|nutrition|recovery)\//i.test(file)) return 'mother'
  return 'common'
}

export function auditCopy(units = sourceUnits()) {
  const findings = []
  for (const { file, ast } of units) {
    if (!ast || /\.test\.[jt]sx?$/.test(file) || file.includes('/locales/')) continue
    walk(ast, [], (node, ancestors) => {
      if (!['StringLiteral', 'JSXText'].includes(node.type)) return
      const category = contextFor(node, ancestors)
      const text = node.value.trim().replace(/\s+/g, ' ')
      if (!category || !/[a-zA-Z\u0B80-\u0BFF]{2}/u.test(text) || /^[a-z][a-z0-9_]*$/.test(text)) return
      if (/^(?:common|auth|landing|onboarding|mother|admin):[a-z][a-z0-9_.]*$/.test(text)) return
      findings.push({ file, component: componentFor(ancestors), line: node.loc.start.line,
        category, text, namespace: namespaceFor(file), start: node.start, end: node.end, type: node.type })
    })
  }
  return findings
}

