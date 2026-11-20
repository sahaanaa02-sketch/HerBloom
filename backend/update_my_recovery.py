
from pathlib import Path
from datetime import datetime
import shutil

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / "frontend" / "src" / "pages" / "mother" / "MyRecovery.jsx"

# If your React project is directly inside D:\HerBloom,
# use that location instead.
if not TARGET.exists():
    TARGET = ROOT / "src" / "pages" / "mother" / "MyRecovery.jsx"

if not TARGET.exists():
    raise SystemExit(
        "MyRecovery.jsx not found. Check your frontend folder path."
    )

original = TARGET.read_text(encoding="utf-8-sig")
code = original

def replace_once(old, new, label):
    global code

    count = code.count(old)

    if count != 1:
        raise SystemExit(
            f"Stopped safely: {label} matched {count} times. "
            "Original file has not been changed."
        )

    code = code.replace(old, new, 1)
    print(f"OK: {label}")


# --------------------------------------
# 1. FIX EXERCISE PLAYER
# --------------------------------------

replace_once(
    """    const instructions = selected.steps || []
    const last = step === instructions.length - 1""",
    """    const instructions = selected.steps || []
    const finished = step >= instructions.length
    const last = step === instructions.length - 1""",
    "Exercise completion state",
)

replace_once(
    """          <p className="mb-4 text-sm text-[#977685]">
            Step {step + 1} of {instructions.length}
          </p>
          <p className="text-xl font-semibold leading-9 text-[#3A1224]">
            {instructions[step]}
          </p>""",
    """          {finished ? (
            <p className="text-xl font-semibold text-[#3A1224]">
              Activity steps completed. Please record how you felt.
            </p>
          ) : (
            <>
              <p className="mb-4 text-sm text-[#977685]">
                Step {step + 1} of {instructions.length}
              </p>
              <p className="text-xl font-semibold leading-9 text-[#3A1224]">
                {instructions[step]}
              </p>
            </>
          )}""",
    "Exercise step display",
)

replace_once(
    """        <div className="flex justify-between gap-3">
          <button type="button"
            className="rounded-full border px-6 py-3"
            disabled={step === 0}""",
    """        {!finished && <div className="flex justify-between gap-3">
          <button type="button"
            className="rounded-full border px-6 py-3"
            disabled={step === 0}""",
    "Exercise navigation visibility",
)

replace_once(
    """        </div>

        {step >= instructions.length && (""",
    """        </div>}

        {finished && (""",
    "Exercise feedback display",
)


# --------------------------------------
# 2. SUPPORT BOTH C-SECTION VALUES
# --------------------------------------

replace_once(
    """  const cSection = context?.delivery_type === 'c_section'""",
    """  const cSection = ['csection', 'c_section'].includes(
    context?.delivery_type
  )""",
    "C-section care detection",
)

replace_once(
    """{context?.delivery_type === 'c_section'
                          ? 'C-section recovery'""",
    """{['csection', 'c_section'].includes(context?.delivery_type)
                          ? 'C-section recovery'""",
    "C-section overview label",
)


# --------------------------------------
# 3. REMOVE DUPLICATE PROFILE STATE
# --------------------------------------

replace_once(
    """  const [profileForm, setProfileForm] = useState({
    birth_date: '',
    delivery_type: 'vaginal',
  })

""",
    "",
    "Duplicate profile state",
)


# --------------------------------------
# 4. REMOVE DUPLICATE SAVE FUNCTION
# --------------------------------------

replace_once(
    """  async function saveContext(event) {
    event.preventDefault()
    try {
      await api.saveContext(token, profileForm)
      await load()
      notify('Recovery profile saved')
    } catch (err) {
      setError(err.message)
    }
  }

""",
    "",
    "Duplicate profile save function",
)


# --------------------------------------
# 5. REPLACE PROFILE SETUP FORM
# --------------------------------------

start_marker = """              <Section title="Set Up Your Recovery Stage" icon={Baby}>"""
end_marker = """              </Section>"""

start = code.find(start_marker)

if start == -1:
    raise SystemExit(
        "Stopped safely: Recovery setup section not found."
    )

end = code.find(end_marker, start)

if end == -1:
    raise SystemExit(
        "Stopped safely: Recovery setup closing section not found."
    )

end += len(end_marker)

old_section = code[start:end]

new_section = """              <Section title="Recovery Profile" icon={Baby}>
                <p className="text-sm leading-7 text-[#765363]">
                  Your recovery stage uses your completed onboarding
                  details automatically. Please complete onboarding
                  or update your birth details in Profile Settings.
                </p>

                <button
                  type="button"
                  className={`${BUTTON} mt-4`}
                  onClick={() => onNavigate?.('settings')}
                >
                  Open Profile Settings
                </button>
              </Section>"""

code = code[:start] + new_section + code[end:]
print("OK: Automatic onboarding profile display")


# --------------------------------------
# SAVE ONLY AFTER ALL CHECKS PASS
# --------------------------------------

backup_name = (
    "MyRecovery.backup-"
    + datetime.now().strftime("%Y%m%d-%H%M%S")
    + ".jsx"
)

backup = TARGET.with_name(backup_name)

shutil.copy2(TARGET, backup)

TARGET.write_text(code, encoding="utf-8")

print()
print("SUCCESS: MyRecovery.jsx updated")
print("Updated file:", TARGET)
print("Backup file:", backup)
print("Original features preserved")
