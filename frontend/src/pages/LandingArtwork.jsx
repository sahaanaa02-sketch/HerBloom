export function Botanical({ className }) {
  return (
    <svg className={`hb-botanical ${className}`} viewBox="0 0 105 150" fill="none"
      stroke="currentColor" strokeWidth="1" aria-hidden="true" focusable="false">
      <path d="M8 147C25 123 32 99 46 75c13-24 30-42 51-61M28 114C11 111 9 91 14 78c15 9 21 20 14 36Zm12-23C24 81 24 65 32 51c12 12 16 25 8 40Zm13-21C41 53 46 38 56 27c8 16 6 30-3 43Zm14-18C67 30 77 20 97 14 94 33 84 49 67 52ZM29 113c15-14 32-15 49-7-14 16-33 19-49 7Zm13-25c17-15 36-19 51-13-12 18-33 22-51 13Zm14-21c14-15 31-20 47-16-10 16-29 23-47 16Z" />
    </svg>
  )
}

export function JourneyIllustration({ step }) {
  return (
    <svg viewBox="0 0 100 100" width="90" height="90" fill="none" aria-hidden="true" focusable="false">
      <ellipse cx="48" cy="50" rx="43" ry="34" fill="#fbe5e9" />
      <ellipse cx="55" cy="63" rx="30" ry="21" fill="#f6d3db" opacity=".65" />
      <g stroke="#7b2346" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {step === '01' && <>
          <rect x="32" y="17" width="35" height="65" rx="6" fill="#fff6f1" />
          <path d="M45 23h9M45 76h9" />
          <circle cx="49.5" cy="42" r="6" fill="#f6d3db" />
          <path d="M39 59c0-5 5-8 10-8s10 3 10 8" />
          <circle cx="68" cy="68" r="11" fill="#d9a25b" stroke="#fff6f1" />
          <path d="M68 63v10m-5-5h10" stroke="#fff6f1" />
        </>}
        {step === '02' && <>
          <rect x="24" y="20" width="53" height="61" rx="7" fill="#fff6f1" />
          <path d="M35 40l3 3 5-6m-8 17 3 3 5-6m-8 17 3 3 5-6m8-24h15m-15 14h15m-15 14h15" />
          <path d="M50 29c-14-9-12-19-5-19 3 0 5 2 5 4 2-3 4-4 7-4 7 0 8 10-7 19Z" fill="#d9a25b" stroke="#fff6f1" />
        </>}
        {step === '03' && <>
          <path d="M23 52c1 17 12 29 27 29s26-12 27-29H23Z" fill="#fff6f1" />
          <ellipse cx="50" cy="52" rx="28" ry="6" fill="#d9a25b" />
          <path d="M45 48c-3-11-10-16-18-16 2 10 8 15 18 16Z" fill="#f6d3db" />
          <path d="M52 47c0-14 9-24 20-25 0 12-9 22-20 25Z" fill="#ede1b4" />
          <path d="M49 43c-5-8-5-14-2-19M32 65c5 7 11 11 18 11" />
        </>}
        {step === '04' && <>
          <path d="M21 38a10 10 0 0 1 10-10h39a10 10 0 0 1 10 10v22a10 10 0 0 1-10 10H44L29 81V70a10 10 0 0 1-8-10Z" fill="#fff6f1" />
          <path d="M37 49h.2m13 0h.2m13 0h.2" strokeWidth="5" />
          <circle cx="75" cy="26" r="12" fill="#d9a25b" stroke="#fff6f1" />
          <path d="m75 19 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#fff6f1" stroke="none" />
        </>}
      </g>
    </svg>
  )
}

