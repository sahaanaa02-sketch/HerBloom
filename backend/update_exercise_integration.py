
from pathlib import Path
from datetime import datetime
import re
import shutil

ROOT = Path(r"D:\HerBloom")

CANDIDATES = [
    ROOT / "frontend/src/pages/mother/MyRecoveryContent.jsx",
    ROOT / "src/pages/mother/MyRecoveryContent.jsx",
]

target = next((p for p in CANDIDATES if p.exists()), None)

if target is None:
    raise SystemExit(
        "MyRecoveryContent.jsx not found. "
        "Check your frontend folder location."
    )

original = target.read_text(encoding="utf-8")
code = original.replace("\r\n", "\n")

def replace_once(old, new, description):
    global code

    count = code.count(old)

    if count != 1:
        raise ValueError(
            f"{description}: expected 1 match, found {count}. "
            "Original file has not been changed."
        )

    code = code.replace(old, new, 1)
    print(f"OK: {description}")


# --------------------------------------------------
# 1. Import ExerciseAccess
# --------------------------------------------------

replace_once(
    "import MotherLayout from '../../components/mother/MotherLayout'",
    """import MotherLayout from '../../components/mother/MotherLayout'
import ExerciseAccess from '../../components/recovery/ExerciseAccess'""",
    "ExerciseAccess import",
)


# --------------------------------------------------
# 2. Fix exercise player final step
# --------------------------------------------------

replace_once(
    """    const instructions = selected.steps || []
    const last = step === instructions.length - 1""",
    """    const instructions = Array.isArray(selected.steps)
      ? selected.steps
      : []
    const finished = step >= instructions.length
    const last = step === instructions.length - 1""",
    "Exercise player completion state",
)

replace_once(
    """        <div className="rounded-2xl bg-[#FFF6F1] p-8 text-center">
          <p className="mb-4 text-sm text-[#977685]">
            Step {step + 1} of {instructions.length}
          </p>
          <p className="text-xl font-semibold leading-9 text-[#3A1224]">
            {instructions[step]}
          </p>
        </div>""",
    """        <div className="rounded-2xl bg-[#FFF6F1] p-8 text-center">
          {finished ? (
            <p className="text-xl font-semibold text-[#3A1224]">
              Activity steps completed.
              Please record how you felt.
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
          )}
        </div>""",
    "Exercise completion screen",
)

replace_once(
    """        <div className="flex justify-between gap-3">
          <button type="button"
            className="rounded-full border px-6 py-3"
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
          >Back</button>

          {!last ? (
            <button type="button" className={BUTTON}
              onClick={() => setStep((s) => s + 1)}
            >Next</button>
          ) : (
            <button type="button" className={BUTTON}
              onClick={() => setStep(instructions.length)}
            >Done</button>
          )}
        </div>""",
    """        {!finished && (
          <div className="flex justify-between gap-3">
            <button
              type="button"
              className="rounded-full border px-6 py-3"
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </button>

            {!last ? (
              <button
                type="button"
                className={BUTTON}
                onClick={() => setStep((s) => s + 1)}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className={BUTTON}
                onClick={() => setStep(instructions.length)}
              >
                Done
              </button>
            )}
          </div>
        )}""",
    "Hide navigation after completion",
)


# --------------------------------------------------
# 3. Support both C-section values
# --------------------------------------------------

code = code.replace(
    "context?.delivery_type === 'c_section'",
    "['csection', 'c_section'].includes(context?.delivery_type)"
)

print("OK: C-section delivery type compatibility")


# --------------------------------------------------
# 4. Remove duplicate recovery profile state
# --------------------------------------------------

replace_once(
    """  const [profileForm, setProfileForm] = useState({
    birth_date: '',
    delivery_type: 'vaginal',
  })

""",
    "",
    "Remove duplicate profile state",
)


# --------------------------------------------------
# 5. Remove old saveContext handler
# --------------------------------------------------

pattern = (
    r"  async function saveContext\(event\) \{"
    r".*?"
    r"(?=  async function completeExercise\(body\))"
)

code, count = re.subn(
    pattern,
    "",
    code,
    count=1,
    flags=re.DOTALL,
)

if count != 1:
    raise ValueError(
        "Could not find old saveContext handler. "
        "Original file has not been changed."
    )

print("OK: Remove old recovery profile API handler")


# --------------------------------------------------
# 6. Replace duplicate onboarding form
# --------------------------------------------------

start_marker = """            {!context?.configured && (
              <Section title="Set Up Your Recovery Stage" icon={Baby}>"""

end_marker = """              </Section>
            )}"""

start = code.find(start_marker)

if start == -1:
    raise ValueError(
        "Recovery profile section not found."
    )

end = code.find(end_marker, start)

if end == -1:
    raise ValueError(
        "Recovery profile section end not found."
    )

end += len(end_marker)

replacement = """            {!context?.configured && (
              <Section title="Recovery Profile" icon={Baby}>
                <p className="text-sm leading-7 text-[#765363]">
                  Your recovery stage is linked to your
                  onboarding profile. Please complete your
                  onboarding details before using
                  personalized recovery guidance.
                </p>
                <button
                  type="button"
                  className={`${BUTTON} mt-4`}
                  onClick={() => onNavigate?.('settings')}
                >
                  View Profile Settings
                </button>
              </Section>
            )}"""

code = code[:start] + replacement + code[end:]

print("OK: Recovery stage uses onboarding profile")


# --------------------------------------------------
# 7. Show disclaimer automatically on Exercise tab
# --------------------------------------------------

replace_once(
    """            {tab === 'exercises' && (
              <ExerciseTab exercises={exercises}
                reload={completeExercise}
              />
            )}""",
    """            {tab === 'exercises' && (
              <ExerciseAccess>
                <ExerciseTab
                  exercises={exercises}
                  reload={completeExercise}
                />
              </ExerciseAccess>
            )}""",
    "Automatic exercise disclaimer",
)


# --------------------------------------------------
# 8. Backup and save
# --------------------------------------------------

timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

backup = target.with_name(
    f"MyRecoveryContent.backup-{timestamp}.jsx"
)

shutil.copy2(target, backup)

target.write_text(code, encoding="utf-8")

print()
print("SUCCESS: Exercise integration completed")
print(f"Updated file: {target}")
print(f"Backup file: {backup}")
print()
print("Existing recovery tabs preserved.")
print("Exercise disclaimer connected.")
print("Exercise player completion fixed.")
print("Onboarding recovery sync updated.")
