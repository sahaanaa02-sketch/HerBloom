import { useRef } from 'react'
import { Button } from '@mui/material'

const textClass = 'mt-1 w-full rounded-lg border border-[#F6D3DB] bg-white px-3 py-2 text-[#3A1224]'

export default function PairedStepsEditor({ title, steps, onChange }) {
  const nextKey = useRef(Math.max(-1, ...steps.map((step) => step.key)) + 1)
  const dragged = useRef(null)

  function move(from, to) {
    if (from == null || to < 0 || to >= steps.length || from === to) return
    const updated = [...steps]
    const [pair] = updated.splice(from, 1)
    updated.splice(to, 0, pair)
    onChange(updated)
  }

  return (
    <section className="space-y-3" aria-label={title}>
      <h3 className="font-semibold">{title}</h3>
      {steps.map((step, index) => (
        <div key={step.key} onDragOver={(event) => { if (dragged.current !== null) event.preventDefault() }}
          onDrop={(event) => {
            if (dragged.current === null) return
            event.preventDefault()
            move(dragged.current, index)
            dragged.current = null
          }} className="rounded-lg border border-[#F6D3DB] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span draggable onDragStart={(event) => {
              dragged.current = index
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', String(index))
            }} onDragEnd={() => { dragged.current = null }} className="cursor-grab font-semibold">Step {index + 1}</span>
            <Button size="small" aria-label={'Move step ' + (index + 1) + ' up'} disabled={index === 0} onClick={() => move(index, index - 1)}>Move up</Button>
            <Button size="small" aria-label={'Move step ' + (index + 1) + ' down'} disabled={index === steps.length - 1} onClick={() => move(index, index + 1)}>Move down</Button>
            <Button size="small" aria-label={'Remove step ' + (index + 1)} onClick={() => onChange(steps.filter((_, i) => i !== index))}>Remove</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[['en', 'English'], ['ta', 'Tamil']].map(([lang, label]) => (
              <label key={lang}>{label}
                <textarea rows={2} maxLength={1000} className={textClass} value={step[lang]} onChange={(event) => {
                  onChange(steps.map((row, i) => i === index ? { ...row, [lang]: event.target.value } : row))
                }} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <Button disabled={steps.length >= 50} onClick={() => onChange([...steps, { key: nextKey.current++, en: '', ta: '' }])}>Add step</Button>
    </section>
  )
}
