# 🕵️ WordSpy

A real-time multiplayer social deduction game where players try to identify the spy among them.

## How It Works

- Players join a private room via link or room code
- Everyone receives the same secret word — except the spy, who gets a related but different word
- Players take turns describing their word in one sentence without saying it directly
- Players discuss who sounds suspicious, then vote to eliminate someone
- The game continues until all spies are found or spies equal the remaining civilians

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend + Backend | Next.js 14 (App Router) |
| Database + Realtime | Supabase (PostgreSQL + WebSockets) |
| AI Word Generation | Groq API — `llama-3.1-8b-instant` (free tier) |
| Hosting | Vercel |
| Styling | Tailwind CSS |

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/wordspy.git
cd wordspy
npm install
```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the migration files in order from `supabase/migrations/`
3. Enable **Realtime** for the `rooms`, `players`, `rounds`, `descriptions`, `votes`, and `messages` tables in the Supabase dashboard
4. Add a unique index for case-insensitive nickname uniqueness:
   ```sql
   CREATE UNIQUE INDEX users_nickname_lower_idx ON users (lower(nickname));
   ```

### 3. Get a Groq API key

1. Go to [console.groq.com](https://console.groq.com)
2. Create a free account and generate an API key
3. Free tier includes 14,400 requests/day — more than enough for word generation

### 4. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GROQ_API_KEY=your_groq_api_key

# Optional: set to "true" to skip AI and use built-in word pairs (useful for local dev)
USE_FALLBACK_WORDS=false
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

Add the same environment variables in your Vercel project dashboard under **Settings → Environment Variables**.

## Game Rules

- **3–16 players** per room
- **1 or more spies** (configurable by host)
- Nicknames are **unique and case-insensitive** — "King" and "king" are the same user
- Each round has four phases:
  1. **Describe** — everyone writes a one-sentence clue about their word
  2. **Discuss** — all descriptions are revealed; players debate who sounds off
  3. **Vote** — players vote to eliminate the most suspicious player
  4. **Result** — the eliminated player is revealed; game continues or ends
- **Civilians win** when all spies are eliminated
- **Spies win** when the number of spies equals or exceeds the remaining civilians
- Closing or refreshing the tab automatically removes you from the room

## Project Structure

```
wordspy/
├── app/
│   ├── page.tsx                        # Home / create room
│   ├── join/page.tsx                   # Join by code
│   ├── room/[code]/
│   │   ├── page.tsx                    # Room entry (redirects to lobby or game)
│   │   ├── lobby/page.tsx              # Waiting room
│   │   └── game/page.tsx              # Active game
│   └── api/
│       ├── rooms/
│       │   ├── route.ts               # POST /api/rooms — create room
│       │   └── [code]/
│       │       ├── route.ts           # GET /api/rooms/[code]
│       │       ├── join/route.ts
│       │       ├── start/route.ts
│       │       └── settings/route.ts
│       ├── rounds/
│       │   └── [id]/
│       │       ├── advance/route.ts   # POST — advance game phase
│       │       ├── my-role/route.ts   # GET — returns player's word (not role)
│       │       └── vote/route.ts
│       ├── players/
│       │   └── [id]/
│       │       ├── route.ts           # DELETE — leave room
│       │       └── disconnect/route.ts # POST — beacon on tab close
│       ├── descriptions/route.ts
│       ├── messages/route.ts
│       └── users/route.ts
├── components/
│   ├── theme.tsx                      # Dark/light mode provider
│   └── ui.tsx                         # Shared UI primitives
├── hooks/
│   └── useBeaconLeave.ts              # Tab-close player cleanup
├── lib/
│   ├── supabase.ts                    # Supabase client
│   ├── game.ts                        # Game logic (roles, win conditions, voting)
│   ├── words.ts                       # Groq AI word pair generation + fallbacks
│   └── player.ts                      # Device token, emoji/color avatars
├── types/
│   └── index.ts                       # Shared TypeScript types
└── supabase/
    └── migrations/                    # SQL migration files
```

## Security & Fair Play

- The server never sends a player's role string to the client — only their word
- The other team's word is never exposed via any API response
- Round data (civilian/spy words) is only fetched client-side at the **result phase** for the final reveal
- All role-sensitive queries use the service-role Supabase client on the server
