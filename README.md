# Bunker — server

Server for **Bunker**, an online social deduction game set in the S.T.A.L.K.E.R. universe. It handles rooms and lobbies, runs the game engine with rounds and voting, resolves action cards, and issues LiveKit tokens for voice and video.

Client: [Bunker-frontend-react](https://github.com/Gor7yo/Bunker-frontend-react).

## Features

- **Rooms.** A room is public (listed on the home page, with filters) or private (joined by code). The host sets the mode, player limit, timers and action card rules. The host can also assign a moderator, kick players and hand over host rights.
- **Two game modes.**
  - **Auto:** the server runs every phase on timers. A round goes reveal → discussion → voting → exile. A tie triggers a defense and a revote, and a second tie is settled by lot.
  - **Moderated:** a moderator who doesn't play controls phases, timers and voting. The moderator can reveal, hide, re-roll or swap any characteristic.
- **Cards.** Each player gets 9 characteristics: gender, age, profession, health, phobia, hobby, baggage, fact and action. Values are dealt without repeats. The bunker has `⌊N/2⌋` seats.
- **18 action cards with working mechanics.** Examples: swaps, suspicion, secret knowledge, immunity, reputation attack (mutes the target's microphone), second chance and legacy. Two room rules apply to them:
  - cards can be played at any time, or only on your own turn;
  - in moderated rooms, cards apply instantly or wait for the moderator's approval.
- **Privacy.** Each player receives their own view of the room. Other players' hidden characteristics never reach the client. Votes stay secret until the voting closes.
- **Resilience.**
  - Players join with a secret token and keep their seat when they reconnect.
  - Running timers are restored after a server restart.
  - Abandoned rooms are cleaned up automatically.
- **Voice and video.** The server issues LiveKit tokens. Speaking rights follow the game state, so exiled players can only listen. The moderator can mute a player.

## Tech stack

NestJS 11 · Socket.IO · Prisma 6 + PostgreSQL · LiveKit Server SDK · TypeScript

## Getting started

Requires Node.js 22+, pnpm and PostgreSQL.

```bash
pnpm install
cp .env.example .env            # set DATABASE_URL
pnpm prisma migrate deploy      # create the tables
pnpm start:dev                  # http://localhost:3000
```

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `PORT` | Server port | `3000` |
| `CLIENT_ORIGIN` | Client URL allowed by CORS | `http://localhost:5173` |
| `MIN_PLAYERS` | Minimum number of players needed to start a game. Set it to `2` for local testing. | `4` |
| `LIVEKIT_URL` | Your LiveKit project URL (`wss://…`) | — |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | LiveKit credentials | — |

Keep secrets in **`.env.local`**. It is git-ignored and loaded before `.env`. Without LiveKit credentials the game still works, just without voice.

To get LiveKit credentials, create a free project at [cloud.livekit.io](https://cloud.livekit.io) or self-host LiveKit. Switching between them only means changing `LIVEKIT_URL`; no code changes.

### Scripts

| Command | What it does |
|---|---|
| `pnpm start:dev` | Run with hot reload |
| `pnpm build` / `pnpm start:prod` | Build and run the compiled server |
| `pnpm lint` | ESLint with autofix |
| `pnpm prisma migrate dev --name <name>` | Create a migration after changing the schema |

## Project structure

```
src/
├── env.ts                    # loads .env.local / .env, config
├── common/                   # GameError, { ok, data | error } result, KeyedLock
├── prisma/                   # PrismaService
└── modules/
    ├── deck/                 # card data, dealing, descriptions (tooltips)
    ├── room/
    │   ├── room.service.ts      # rooms & lobby: create, join, settings, kick, leave
    │   ├── room.gateway.ts      # room and lobby events
    │   ├── rooms.controller.ts  # GET /rooms — public rooms with filters
    │   ├── room.view.ts         # room state as seen by one player
    │   ├── realtime.service.ts  # broadcasts room:state
    │   ├── room-lock.service.ts # serializes changes per room
    │   └── presence.service.ts  # who is online (socket ↔ player)
    ├── game/
    │   ├── game.rules.ts     # phase transitions
    │   ├── game.actions.ts   # the 18 action card mechanics
    │   ├── game.context.ts   # one game transaction: state + changed players
    │   ├── game.service.ts   # commands, timers, persistence
    │   ├── game.gateway.ts   # game:* and mod:* events
    │   ├── game.view.ts      # game state as seen by one player
    │   └── data/scenarios.ts # catastrophes and bunkers
    └── voice/                # LiveKit tokens, speaking rights, muting
```

### How it works

- **Storage.** The game state is stored as JSON in `rooms.game`. Player characteristics live in `players.card` and `players.revealed`.
- **One change at a time.** Every change to a room goes through `RoomLock`. Concurrent socket events and timers never interleave.
- **Personal views.** After each change, every connected player receives `room:state` containing only what they are allowed to see.
- **Timers.** In auto mode each phase has a `phaseEndsAt` time and the server schedules a timer for it. A phase sequence number (`seq`) makes the server ignore timers left over from earlier phases.

## Protocol

Clients connect to the **`/game`** Socket.IO namespace. Every event replies through the ack callback with `{ ok: true, data }` or `{ ok: false, error }`. Error messages are user-facing, in Russian.

**Server → client:**

| Event | Meaning |
|---|---|
| `room:state` | The room as seen by this player |
| `room:kicked` | The host kicked this player |
| `session:replaced` | The same player opened the room elsewhere |
| `rooms:changed` | The public room list changed; refetch it |

**Client → server:**

| Group | Events |
|---|---|
| Session & rooms | `room:create {name, settings}`, `room:join {code, name}`, `session:resume {token}`, `room:leave`, `rooms:watch`, `rooms:unwatch` |
| Lobby | `lobby:ready {ready}`, `lobby:settings {settings}`, `lobby:setModerator {playerId}`, `lobby:kick {playerId}`, `room:transferHost {playerId}` |
| Game | `game:start`, `game:reveal {key}`, `game:endTurn`, `game:readyToVote`, `game:vote {playerId}`, `game:playAction {targetId?, otherId?, key?}`, `game:backToLobby` |
| Moderator | `mod:phase {phase, seconds?}`, `mod:speaker {playerId, seconds?}`, `mod:startVoting {candidates?, seconds?}`, `mod:closeVoting`, `mod:exile`, `mod:revive`, `mod:reveal`, `mod:hide`, `mod:reroll`, `mod:swap`, `mod:nextRound`, `mod:finish`, `mod:approveAction {id}`, `mod:rejectAction {id}` |
| Voice | `voice:token` → `{url, token}`, `voice:mute {playerId}` |

**HTTP:**

| Request | Response |
|---|---|
| `GET /rooms?q=&mode=AUTO\|MODERATED&freeSlots=1&sort=popular\|new&limit=` | `{ rooms, total }` |
