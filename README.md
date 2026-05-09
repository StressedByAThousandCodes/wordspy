# 🕵️ Who Is The Spy?

A real-time multiplayer word-guessing game where players try to identify the spy among them.

## How It Works

- Players join a private room via link or room code
- Everyone receives the same word — except the spy, who gets a related but different word
- Players describe their word in a time-limited round
- Players discuss and vote to eliminate the spy
- The game continues until the spy is found or the civilians are outnumbered

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend + Backend | Next.js 14 (App Router) |
| Database + Realtime | Supabase (PostgreSQL + WebSockets) |
| AI Word Generation | Google Gemini Flash 2.0 (free tier) |
| Hosting | Vercel |
| Styling | Tailwind CSS |

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/who-is-the-spy.git
cd who-is-the-spy
npm install
```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the migration files in order from `supabase/migrations/`
3. Enable **Realtime** for the `rooms`, `players`, `rounds`, `descriptions`, and `votes` tables in the Supabase dashboard

### 3. Get a Gemini API key

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Create a free API key

### 4. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 6. Deploy to Vercel

```bash
npx vercel
```

Add the same environment variables in your Vercel project dashboard.

## Game Rules

- **3–16 players** per room
- **1 or more spies** (configurable by host)
- Each round has three phases:
  1. **Describe** — everyone submits a one-sentence description of their word
  2. **Discuss** — all descriptions are revealed and players debate
  3. **Vote** — players vote to eliminate the most suspicious player
- **Civilians win** when all spies are eliminated
- **Spies win** when they equal or outnumber the remaining civilians

## Project Structure

```
who-is-the-spy/
├── app/
│   ├── page.tsx                  # Home / create room
│   ├── join/page.tsx             # Join by code
│   ├── room/[code]/
│   │   ├── page.tsx              # Room entry (redirects to lobby or game)
│   │   ├── lobby/page.tsx        # Waiting room
│   │   └── game/page.tsx         # Active game
│   └── api/
│       ├── rooms/
│       │   ├── route.ts          # POST /api/rooms — create room
│       │   └── [code]/
│       │       ├── join/route.ts
│       │       ├── start/route.ts
│       │       └── settings/route.ts
│       └── rounds/
│           └── [id]/
│               └── vote/route.ts
├── components/
│   ├── lobby/                    # Lobby UI components
│   ├── game/                     # Game phase components
│   └── ui/                       # Shared UI primitives
├── lib/
│   ├── supabase.ts               # Supabase client
│   ├── game.ts                   # Game state machine
│   ├── words.ts                  # AI word pair generation
│   └── utils.ts                  # Helpers
├── types/
│   └── index.ts                  # Shared TypeScript types
└── supabase/
    └── migrations/               # SQL migration files
```

## Roadmap

- [ ] Phase 1: Project setup & Supabase schema
- [ ] Phase 2: Room creation & join flow
- [ ] Phase 3: Lobby with live player list
- [ ] Phase 4: AI word generation
- [ ] Phase 5: Game loop (describe → discuss → vote → result)
- [ ] Phase 6: Realtime sync across all phases
- [ ] Phase 7: Settings panel & edge case handling
- [ ] Phase 8: Final deploy & testing
