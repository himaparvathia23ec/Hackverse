# Hackverse — Interview Co-Pilot

Real-time interview practice with optional webcam feedback, speech-to-text answers, resume-aware AI questions, Claude coaching, and in-app session reporting.

---

## Clone & install

```bash
git clone https://github.com/himaparvathia23ec/Hackverse.git
cd Hackverse

cd frontend && npm install && cd ..
cd backend && npm install && cd ..
```

---

## Backend config

Create `backend/.env`:

```env
ANTHROPIC_API_KEY=your_key_here

# Optional:
# PORT=3001
# ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

Do **not** commit `.env` — it is listed in `.gitignore`.

---

## Run (UI + API)

From the repo root:

```bash
cd frontend
npm run dev:all
```

- **App:** http://localhost:5173 — if that port is busy, use the URL Vite prints in the terminal.
- **API:** `http://localhost:3001` — the Vite dev server proxies `/api` to the backend.

---

## Run separately

**Terminal 1 — backend**

```bash
cd backend && npm run dev
```

**Terminal 2 — frontend**

```bash
cd frontend && npm run dev
```

---

## Production build (frontend only)

```bash
cd frontend
npm run build
npm run preview
```

---

## API overview

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check + whether API key is set |
| `POST` | `/api/resume/parse` | Resume text → structured JSON |
| `POST` | `/api/resume/questions` | ~20 HR / technical / project questions |
| `POST` | `/api/coach` | Coaching + STAR + follow-ups from Q&A |
| `POST` | `/api/report` | Session summary JSON for the report file |

If `ANTHROPIC_API_KEY` is missing, AI routes return **503**; the app uses local fallbacks where implemented.

---

## Architecture snapshot

- **Frontend (`frontend`)**: React + Vite UI, browser speech recognition/synthesis, live coaching panels.
- **Backend (`backend`)**: Express API for resume parsing, question generation, coaching, and adaptive next question.
- **AI Provider**: Anthropic Claude via backend only (API key never exposed in frontend).
- **Flow**: Resume upload -> parse -> generate questions -> record answer -> coach feedback -> practice loop.

---

## How real-time works

- **During recording (real-time)**:
  - live transcript updates
  - filler count updates
  - live helper cues (missing keywords, pacing, STAR-structure nudges)
- **After stop (full-answer coaching)**:
  - `/api/coach` analyzes the complete final transcript
  - returns scores, phrase replacements, missing keywords, improved answer, ideal answer, practice script

---

## Fallback behavior

- If backend AI is unavailable or times out, UI switches to **Fallback mode active**.
- Resume parsing/questions/coaching still provide safe deterministic local output so demo never goes blank.
- A visible status chip indicates whether you are in **Live AI** or **Fallback coaching active** mode.

---

## Demo flow (90 seconds)

1. Upload resume and optionally enter target role + JD focus.
2. Generate a question and click mic to answer for ~20 seconds.
3. Show live cues while speaking (keywords/filler/pacing hints).
4. Stop recording -> open coaching output (scores + replacements + improved + ideal answer).
5. Click Practice Mode, repeat once, show match score improvement.

---

## Browser permissions

- **Microphone** — Used for speech recognition while answering.
- **Camera** — Optional, for on-device expression hints.

Prefer **localhost** or **HTTPS** for APIs and media APIs.

---

## License

Add a license if you distribute this repo publicly.

---

## Credits

Built for a hackathon · [Anthropic](https://www.anthropic.com/) · [Vite](https://vite.dev/) · [React](https://react.dev/) · [Tailwind CSS](https://tailwindcss.com/)
