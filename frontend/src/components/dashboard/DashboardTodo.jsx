import { useTranslation } from 'react-i18next'

import { useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'

export default function DashboardTodo({
  tasks = [],
  onAdd,
  onToggle,
  onDelete,
}) {
  const { t: localizeCopy } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [newTask, setNewTask] = useState('')

  const completed = tasks.filter((task) => task.done).length
  const total = tasks.length

  const submit = (event) => {
    event.preventDefault()
    const title = newTask.trim()

    if (!title) return

    onAdd?.(title)
    setNewTask('')
  }

  return (
    <section className="h-full rounded-[26px] border border-[#F3E2E6] bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="font-['Playfair_Display'] text-xl font-semibold text-[#3A1224]">
            {uiText('today_s_to_do')}
          </h2>
          <p className="mt-1 text-xs text-[#987B86]">
            {localizeCopy('common:little_steps_matter')}
          </p>
        </div>

        <span className="rounded-full bg-[#FFF0F3] px-3 py-1 text-xs font-semibold text-[#7B2346]">
          {completed}/{total}
        </span>
      </div>

      <div className="space-y-3">
        {tasks.length === 0 ? (
          <p className="rounded-xl bg-[#FFF8F6] p-4 text-sm text-[#987B86]">
            {localizeCopy('common:no_tasks_yet_add_your_first_gentle_reminder')}
          </p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 rounded-xl bg-[#FFF9F7] p-3"
            >
              <button
                type="button"
                onClick={() => onToggle?.(task.id)}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  task.done
                    ? 'border-[#7B2346] bg-[#7B2346] text-white'
                    : 'border-[#D6B9C3] bg-white'
                }`}
                aria-label={`Toggle ${task.title}`}
              >
                {task.done && <Check size={13} />}
              </button>

              <span
                className={`flex-1 text-sm ${
                  task.done
                    ? 'text-[#B29CA5] line-through'
                    : 'text-[#644654]'
                }`}
              >
                {task.title}
              </span>

              <button
                type="button"
                onClick={() => onDelete?.(task.id)}
                aria-label={`Delete ${task.title}`}
                className="text-[#C3A7B1] hover:text-[#7B2346]"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      <form onSubmit={submit} className="mt-5 flex gap-2">
        <input
          value={newTask}
          onChange={(event) => setNewTask(event.target.value)}
          placeholder={uiText('add_a_personal_task')}
          maxLength={120}
          className="min-w-0 flex-1 rounded-xl border border-[#F0DEE4] bg-[#FFFAF8] px-3 py-3 text-sm outline-none focus:border-[#7B2346]"
        />

        <button
          type="submit"
          className="rounded-xl bg-[#7B2346] px-4 text-white"
          aria-label={uiText('add_task')}
        >
          <Plus size={18} />
        </button>
      </form>
    </section>
  )
}
