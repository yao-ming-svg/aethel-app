# Aethel AI-Assisted Study Planner

**CS4800 Software Engineering — Spring 2026**  
**Team:** Yiming Lu, Vincent Chen Yu, Jomar Veloso  
**Instructor:** Prof. Hussain Zaidi

Aethel is a browser-based student productivity app powered by OpenAI. It helps students manage courses, assignments, and study sessions, with an AI assistant that understands their schedule, tasks, and uploaded course documents.

---

## Features

- **Dashboard** — course overview, upcoming tasks, and study timer
- **Schedule** — weekly timetable with class blocks and task deadlines
- **Tasks** — assignment tracking with filtering by course and status
- **Resources** — upload and label PDF/DOCX study documents
- **AI Assistant** — chat with context of your courses, assignments, schedule, and uploaded documents
- **Analytics** — study hours charts, task completion by subject, streak tracking
- **Settings** — profile, password, and account management

---

## Build & Deployment Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm (included with Node.js)
- An OpenAI API key ([platform.openai.com/api-keys](https://platform.openai.com/api-keys))

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/yao-ming-svg/aethel-app.git
cd aethel-app

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env
```

Open `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-key-here
```

### Run (Development)

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build (Production)

```bash
npm run build
npm run preview
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, CSS Modules |
| Routing | React Router v7 |
| AI | OpenAI API (gpt-4o-mini) via Vite dev middleware |
| File storage | IndexedDB (file blobs), localStorage (metadata) |
| Document parsing | pdfjs-dist, mammoth |
| Markdown rendering | react-markdown |

---

## Project Structure

```
src/
├── api/            # OpenAI chat API client
├── components/     # Shared UI components (Layout, Sidebar, Modals, Timer)
├── context/        # React context (Auth, Courses, Resources, StudySessions)
├── lib/            # Utilities (document extraction, blob store, flashcards)
├── pages/          # Route-level pages
└── App.jsx         # Root with provider tree and routes
openai-api-plugin.mjs   # Vite server middleware (keeps API key off client)
```

---

## Release Notes

### Sprint 3 (May 2026) — Current Release

- AI Assistant now receives full student context: courses, schedule, pending assignments, and uploaded documents on every message
- PDFs and DOCX files uploaded to course or task materials are stored in IndexedDB and automatically appear in the Resources tab
- Study Timer on Dashboard with course selector; timer state persists across page navigation
- Analytics page fully implemented: study hours bar chart (last 7 days), tasks by subject, 30-day trend chart, streak counter
- Chat session history persists within the browser session

### Sprint 2 (April 2026)

- AI Assistant with file attachment support (PDF/DOCX upload and text extraction)
- Resources tab with file upload, labeling, download, and search
- Full routing: Dashboard, Schedule, Tasks, Resources, Analytics, AI Assistant, Settings

### Sprint 1 (March 2026)

- Initial React + Vite project scaffold
- Login, Register, and Onboarding wizard
- Course and task management with localStorage persistence

---

## Data & Privacy

All user data (courses, tasks, study sessions, uploaded documents) is stored **locally in the browser** using localStorage and IndexedDB. No user data is sent to any server except message content sent to the OpenAI API during chat sessions.
