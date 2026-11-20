import { ChefHat, Leaf } from 'lucide-react'

export default function MealIdeas({ ideas = [] }) {
  return (
    <div className="rounded-3xl border border-[#F2DFE5] bg-white p-6">
      <div className="mb-6 flex items-center gap-3">
        <ChefHat size={25} className="text-[#7B2346]" />

        <h3 className="font-['Playfair_Display'] text-xl text-[#7B2346]">
          Sri Lankan Meal Ideas
        </h3>
      </div>

      {!ideas.length ? (
        <p className="text-sm text-[#977A86]">
          Meal ideas will appear here after importing the catalog.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className="rounded-2xl bg-[#FFF6F1] p-5"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#F6D3DB]">
                <Leaf size={22} className="text-[#7B2346]" />
              </div>

              <p className="font-semibold text-[#7B2346]">
                {idea.title}
              </p>

              <p className="mt-3 text-xs leading-6 text-[#795C69]">
                {idea.description}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {(idea.tags || []).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white px-3 py-1 text-[11px] text-[#7B2346]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-2xl bg-[#FCE9EF] p-5">
        <h4 className="font-semibold text-[#7B2346]">
          Feeding and Nutrition
        </h4>

        <p className="mt-2 text-sm leading-6 text-[#795C69]">
          During postpartum recovery, regular meals and a
          varied diet can help support wellbeing. Breastfeeding
          mothers may have different nutrition needs. Seek
          individualized guidance when needed.
        </p>
      </div>
    </div>
  )
}