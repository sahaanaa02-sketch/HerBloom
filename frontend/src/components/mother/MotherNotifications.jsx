export function MotherNotices({ announcements, tip }) {
  return <>
    {announcements.filter((item) => item.channel === 'banner').map((item) => (
      <aside key={item.id} className="mb-4 rounded-2xl border border-[#F2DEE5] bg-white px-4 py-3 shadow-sm sm:px-5">
        <h2 className="font-semibold text-[#7B2346]">{item.title}</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.body}</p>
      </aside>
    ))}
    {tip && <aside className="mb-4 rounded-2xl border border-[#F2DEE5] bg-white px-4 py-3 shadow-sm sm:px-5">
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{tip.text}</p>
    </aside>}
  </>
}
