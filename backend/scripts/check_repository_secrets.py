"""Report credential-shaped paths and line numbers without printing the values."""
import argparse
import re
import subprocess
from pathlib import Path

SECRET_FILE = re.compile(
    r"(?:^|/)(?:\.env(?:\..*)?|[^/]+\.env|[^/]+\.(?:key|pem|pfx|p12|dump|sqlite\w*)|"
    r"a14-demo-credentials\.json|snapshot\.json)(?:$|/)", re.I,
)
PATTERNS = {
    "private key": r"-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----",
    "provider token": r"AIza[\w-]{35}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{45,}|"
                      r"sk-(?:proj-)?[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}",
    "credential URI": r"(?i)(?:mysql(?:\+\w+)?|postgres(?:ql)?)://[^\s:/]+:[^\s@]+@",
    "literal credential": (
        r"(?im)^\s*(?:password|api_key|admin_jwt_secret|merchant_secret|totp_secret|secret_key|db_password)"
        r"\s*[:=]\s*['\"][^'\"]{8,}['\"]"
    ),
}


def git(*args):
    return subprocess.check_output(["git", *args])


def paths(*args):
    return [path.decode("utf-8") for path in git(*args).split(b"\0") if path]


def inspect(label, name, data):
    findings = 0
    if SECRET_FILE.search(name):
        print(f"{label}: credential filename")
        findings += 1
    if b"\0" in data:
        return findings, 1
    content = data.decode("utf-8", errors="replace")
    for tag, pattern in PATTERNS.items():
        for item in re.finditer(pattern, content):
            if (tag == "literal credential"
                    and name in {"backend/app/test_a14_security.py", "backend/app/test_e2e_settings.py"}
                    and re.search(r"""['"]synthetic""", item.group(), re.I)):
                continue
            print(f"{label}:{content.count(chr(10), 0, item.start()) + 1}: {tag}")
            findings += 1
    return findings, 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staged", action="store_true", help="Scan the Git index instead of working-tree candidates.")
    parser.add_argument("--history", action="store_true", help="Also scan reachable commit trees.")
    args = parser.parse_args()
    options = ("--cached",) if args.staged else ("--cached", "--others", "--exclude-standard")
    names = sorted(set(paths("ls-files", "-z", *options)))
    counts = [0, 0]
    scanned = 0

    def audit(label, name, raw):
        nonlocal scanned
        findings, binary = inspect(label, name, raw)
        counts[0] += findings
        counts[1] += binary
        scanned += 1

    for name in names:
        file = Path(name)
        if not args.staged and (not file.is_file() or file.is_symlink()):
            print(f"{name}: missing or symbolic-link candidate requires review")
            counts[0] += 1
            continue
        audit(name, name, git("show", ":" + name) if args.staged else file.read_bytes())
    if args.history:
        for commit in git("rev-list", "--all").decode().splitlines():
            for name in paths("ls-tree","-r","-z","--name-only",commit):
                audit(commit[:8]+":"+name,name,git("show",commit+":"+name))
    print(f"Scanned {scanned} entries, {counts[1]} binary entries skipped for content, {counts[0]} findings.")
    return int(counts[0] > 0)


if __name__ == "__main__":
    raise SystemExit(main())
