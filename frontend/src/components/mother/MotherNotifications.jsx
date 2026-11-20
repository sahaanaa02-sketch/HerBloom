export function MotherNotices({ announcements, tip }) {
  return <>
    {announcements.filter((item) => item.channel === 'banner').map((item) => (
      <aside key={item.id} className="mb-4 rounded-xl border border-[#F2DEE5] bg-white p-4">
        <h2 className="font-semibold text-[#7B2346]">{item.title}</h2>
        <p className="whitespace-pre-wrap">{item.body}</p>
      </aside>
    ))}
    {tip && <aside className="mb-4 rounded-xl border border-[#F2DEE5] bg-white p-4">
      <p className="whitespace-pre-wrap">{tip.text}</p>
    </aside>}
  </>
}
