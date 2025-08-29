import os, json, pathlib, sys, re
from openai import OpenAI

# Files the bot is allowed to edit (keep it tight)
EDITABLE = ["index.html", "style.css", "app.js", "sw.js"]

ROOT = pathlib.Path(__file__).resolve().parents[2]
PROMPT = os.environ.get("PROMPT", "").strip()
if not PROMPT:
    print("No prompt provided. Use `/liftlog <your instructions>` in a comment.")
    sys.exit(1)

def read(p):
    fp = ROOT / p
    return fp.read_text(encoding="utf-8") if fp.exists() else ""

def write(p, content):
    fp = ROOT / p
    fp.write_text(content, encoding="utf-8")

# Build context (current file contents)
project = [{"path": f, "content": read(f)} for f in EDITABLE]

# System rules: keep changes safe and predictable
SYSTEM = (
    "You are an exact code-editing engine for a small PWA called LiftLog.\n"
    "- Only modify files listed in 'editable_files'.\n"
    "- NEVER create new files unless the user explicitly asks.\n"
    "- Preserve existing behaviour and style.\n"
    "- If the change touches CSS or JS used by the PWA, bump the service worker CACHE string in sw.js (e.g. +1).\n"
    "- Return a single JSON object: {\"files\":[{\"path\":\"...\",\"content\":\"...\"}]} with full file contents for any file you modify.\n"
)

USER = {
    "instruction": PROMPT,
    "editable_files": EDITABLE,
    "project": project,
}

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

# Ask the model for a JSON package of updated files
resp = client.responses.create(
    model="gpt-4o-mini",
    input=[
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": json.dumps(USER)},
    ],
)

# Try to extract JSON with {"files":[...]}
try:
    text = resp.output_text
except Exception:
    # Fallback if the SDK returns structured parts
    text = json.dumps(resp.dict())

m = re.search(r'\{[\s\S]*"files"[\s\S]*\}', text)
if not m:
    print("No files object returned by model.")
    sys.exit(1)

data = json.loads(m.group(0))
files = data.get("files", [])
if not files:
    print("Model returned no file updates.")
    sys.exit(1)

updated = 0
for f in files:
    path = f.get("path")
    content = f.get("content")
    if path in EDITABLE and isinstance(content, str):
        write(path, content)
        updated += 1

if updated == 0:
    print("No editable files were updated.")
    sys.exit(1)

print(f"Updated {updated} file(s).")
