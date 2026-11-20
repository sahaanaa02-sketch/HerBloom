import argparse
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, build_opener


def smoke():
    api = "http://127.0.0.1:8100"
    opener = build_opener(ProxyHandler({}))

    def get(path):
        with opener.open(api + path, timeout=5) as response:
            return json.load(response)

    if get("/health/e2e") != {"mode": "e2e", "status": "ready"}:
        raise RuntimeError("The endpoint does not identify itself as the verified local E2E API.")
    paths = get("/openapi.json")["paths"]
    required = {"/api/admin/articles", "/api/admin/exercises", "/recovery/exercises/for-me", "/articles"}
    if not required.issubset(paths):
        raise RuntimeError("Expected Article or Exercise routes are missing.")
    for path in sorted(required):
        try:
            get(path)
        except HTTPError as error:
            if error.code in (401, 403):
                continue
            raise
        raise RuntimeError("A protected smoke-test route accepted an anonymous request.")
    print("E2E read-only smoke checks passed.")


def main():
    parser = argparse.ArgumentParser(description="HerBloom isolated E2E tools")
    parser.add_argument("command", choices=("preflight", "serve", "fixtures", "reset", "smoke"))
    args = parser.parse_args()
    if os.environ.get("HERBLOOM_ENV") != "e2e":
        parser.exit(1, "Set HERBLOOM_ENV=e2e and select the private E2E settings file.\n")

    try:
        from app.e2e_guard import authorize_e2e_launcher, preflight

        if args.command == "serve":
            import uvicorn

            authorize_e2e_launcher()
            uvicorn.run("app.main:app", host="127.0.0.1", port=8100, lifespan="on")
            return 0

        preflight()
        if args.command == "preflight":
            print("E2E configuration, media path, database identity and grants verified.")
        elif args.command == "smoke":
            smoke()
        else:
            from app.e2e_fixtures import write_fixtures

            write_fixtures(reset=args.command == "reset")
    except RuntimeError as error:
        parser.exit(1, f"{error}\n")
    except (URLError, OSError, ValueError, KeyError):
        parser.exit(1, "The E2E smoke check could not verify the local test API.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
