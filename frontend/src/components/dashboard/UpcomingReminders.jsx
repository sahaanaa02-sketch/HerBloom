import { useTranslation } from 'react-i18next'

import { isActiveReminder, reminderTimestamp, REMINDER_TIME_ZONE } from '../../hooks/useReminders'
import { useMotherNotifications } from '../../hooks/useMotherNotifications'
import { useState } from 'react'
import { Bell, Plus, Trash2 } from 'lucide-react'

export default function UpcomingReminders({
  reminders = [],
  token,
  onAdd,
  onDelete,
}) {
  const { t: auditText, i18n } = useTranslation()
  const { t: localizeCopy } = useTranslation()
  const { t: uiText } = useTranslation('common')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [dateTime, setDateTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [templateKey, setTemplateKey] = useState('')
  const templates = useMotherNotifications(token, '/dashboard/reminders/templates', [])
  const template = templates.find((item) => item.key === templateKey)

  const submit = async (event) => {
    event.preventDefault()

    const cleanTitle = title.trim()

    if (!cleanTitle || !dateTime || saving) return

    setSaving(true)

    try {
      // Backend expects a local datetime without Z.
      const saved = await onAdd?.({
        title: cleanTitle,
        ...(template ? { description: template.text } : {}),
        remind_at: `${dateTime}:00`,
      })

      if (saved === false) return

      setTitle('')
      setTemplateKey('')
      setDateTime('')
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  const upcoming = reminders
    .filter(
      (item) =>
        isActiveReminder(item) &&
        reminderTimestamp(item.remind_at) > Date.now()
    )
    .sort(
      (a, b) =>
        reminderTimestamp(a.remind_at) - reminderTimestamp(b.remind_at)
    )
    .slice(0, 3)

  return (
    <section className="h-full rounded-[26px] border border-[#F3E2E6] bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-['Playfair_Display'] text-xl font-semibold text-[#3A1224]">
            {uiText('upcoming_reminders')}
          </h2>
          <p className="mt-1 text-xs text-[#987B86]">
            {localizeCopy('common:stay_gently_on_track')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 rounded-full bg-[#FFF0F3] px-3 py-2 text-xs font-semibold text-[#7B2346]"
        >
          <Plus size={14} />
          {uiText('add')}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="mb-5 space-y-3 rounded-2xl bg-[#FFF8F6] p-4"
        >
          {templates.length > 0 && (
            <label className="block text-sm">
              {uiText('reminder_template')}
              <select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[#F0DEE4] bg-white px-3 py-3">
                <option value="">{uiText('custom_reminder')}</option>
                {templates.map((item) => <option key={item.key} value={item.key}>{item.text}</option>)}
              </select>
            </label>
          )}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={uiText('reminder_title')}
            maxLength={120}
            className="w-full rounded-xl border border-[#F0DEE4] bg-white px-3 py-3 text-sm"
            required
          />

          <input
            type="datetime-local"
            value={dateTime}
            onChange={(event) => setDateTime(event.target.value)}
            className="w-full rounded-xl border border-[#F0DEE4] bg-white px-3 py-3 text-sm"
            required
          />

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-[#7B2346] py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? localizeCopy('common:saving_dots') : auditText('common:save_reminder')}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {upcoming.length === 0 ? (
          <p className="rounded-xl bg-[#FFF8F6] p-4 text-sm text-[#987B86]">
            {auditText('common:no_upcoming_reminders')}
          </p>
        ) : (
          upcoming.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl bg-[#FFF9F7] p-3"
            >
              <div className="rounded-xl bg-[#FCE8EE] p-2 text-[#7B2346]">
                <Bell size={17} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#644654]">
                  {item.title}
                </p>

                <p className="mt-1 text-xs text-[#987B86]">
                  {new Date(reminderTimestamp(item.remind_at)).toLocaleString(
                    i18n.resolvedLanguage === 'ta' ? 'ta-LK' : 'en-LK',
                    {
                      timeZone: REMINDER_TIME_ZONE,
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onDelete?.(item.id)}
                aria-label={`Delete ${item.title}`}
                className="text-[#C3A7B1] hover:text-[#7B2346]"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
