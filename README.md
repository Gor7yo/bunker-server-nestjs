# Бункер — сервер

Сервер онлайн-игры «Бункер» в сеттинге S.T.A.L.K.E.R.: комнаты и лобби, игровой движок с раундами и голосованием, карты действий, голос и видео через LiveKit.

Клиент: [Bunker-frontend-react](https://github.com/Gor7yo/Bunker-frontend-react).

## Возможности

- **Комнаты** — публичные (список на главной с фильтрами) и приватные (вход по коду). Хост настраивает режим, лимит игроков, таймеры, правила карт действий; назначает ведущего, кикает, передаёт права.
- **Два режима игры**
  - **Автоматический** — сервер сам ведёт фазы по таймерам: раскрытие → обсуждение → голосование → (оправдание и переголосование при ничьей, затем жребий) → изгнание.
  - **С ведущим** — ведущий не играет, управляет фазами, таймерами и голосованием, может открывать, скрывать, заменять и менять местами любые характеристики.
- **Карты** — 9 характеристик (пол, возраст, профессия, здоровье, фобия, хобби, багаж, факт, действие), раздаются без повторов. Мест в бункере — `⌊N/2⌋`.
- **18 карт действий** с настоящей механикой: обмен, подозрение, тайное знание, иммунитет, атака на репутацию (отключение микрофона), второй шанс, наследие и т.д. Правила комнаты: играть в любой момент или только в свой ход; в режиме с ведущим — сразу или после его одобрения.
- **Приватность** — каждый игрок получает своё состояние: чужие скрытые характеристики и голоса до закрытия голосования на клиент не уходят.
- **Устойчивость** — вход по секретному токену, переподключение без потери места, таймеры восстанавливаются после перезапуска, брошенные комнаты удаляются сами.
- **Голос и видео** — токены LiveKit, права на голос зависят от состояния игры (изгнанные только слушают), ведущий может выключить микрофон игроку.

## Стек

NestJS 11 · Socket.IO · Prisma 6 + PostgreSQL · LiveKit Server SDK · TypeScript

## Быстрый старт

Нужны Node.js 22+, pnpm и PostgreSQL.

```bash
pnpm install
cp .env.example .env            # пропишите DATABASE_URL
pnpm prisma migrate deploy      # создать таблицы
pnpm start:dev                  # http://localhost:3000
```

### Переменные окружения

| Переменная | Описание | По умолчанию |
|---|---|---|
| `DATABASE_URL` | Строка подключения к PostgreSQL | — |
| `PORT` | Порт сервера | `3000` |
| `CLIENT_ORIGIN` | Адрес клиента для CORS | `http://localhost:5173` |
| `MIN_PLAYERS` | Минимум игроков для старта (для тестов удобно `2`) | `4` |
| `LIVEKIT_URL` | `wss://…` адрес проекта LiveKit | — |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Ключи LiveKit | — |

Секреты храните в **`.env.local`** — он в `.gitignore` и читается раньше `.env`. Без ключей LiveKit игра работает, просто без голоса.

Ключи LiveKit: бесплатный проект на [cloud.livekit.io](https://cloud.livekit.io) или свой сервер LiveKit (код не меняется, только `LIVEKIT_URL`).

### Скрипты

| Команда | Что делает |
|---|---|
| `pnpm start:dev` | Запуск с перезагрузкой при изменениях |
| `pnpm build` / `pnpm start:prod` | Сборка и запуск собранной версии |
| `pnpm lint` | ESLint с автоисправлением |
| `pnpm prisma migrate dev --name <имя>` | Новая миграция после изменения схемы |

## Структура

```
src/
├── env.ts                    # загрузка .env.local / .env, конфиг
├── common/                   # GameError, ответ { ok, data | error }, KeyedLock
├── prisma/                   # PrismaService
└── modules/
    ├── deck/                 # колода: данные карт, раздача, описания (подсказки)
    ├── room/
    │   ├── room.service.ts   # комнаты и лобби: создание, вход, настройки, кик, выход
    │   ├── room.gateway.ts   # события комнат и лобби
    │   ├── rooms.controller.ts  # GET /rooms — список публичных комнат с фильтрами
    │   ├── room.view.ts      # состояние комнаты для конкретного игрока
    │   ├── realtime.service.ts  # рассылка room:state
    │   ├── room-lock.service.ts # очередь изменений на комнату
    │   └── presence.service.ts  # кто в сети (сокет ↔ игрок)
    ├── game/
    │   ├── game.rules.ts     # переходы между фазами
    │   ├── game.actions.ts   # механика 18 карт действий
    │   ├── game.context.ts   # одна транзакция игры: состояние + изменённые игроки
    │   ├── game.service.ts   # команды, таймеры, сохранение
    │   ├── game.gateway.ts   # события game:* и mod:*
    │   ├── game.view.ts      # игровое состояние для игрока
    │   └── data/scenarios.ts # катастрофы и бункеры
    └── voice/                # токены LiveKit, права на голос, выключение микрофона
```

### Как устроено

- **Состояние игры** хранится в `rooms.game` (JSON), характеристики игроков — в `players.card` / `players.revealed`.
- **Все изменения комнаты** идут строго по очереди через `RoomLock`, чтобы одновременные события и таймеры не мешали друг другу.
- **После каждого изменения** каждый подключённый игрок получает `room:state` — только то, что ему положено видеть.
- **В автоматическом режиме** у фазы есть `phaseEndsAt`. Сервер ставит таймер, а номер фазы (`seq`) защищает от срабатывания устаревших таймеров.

## Протокол

Клиент подключается к namespace **`/game`** (Socket.IO). Каждое событие отвечает через ack: `{ ok: true, data }` или `{ ok: false, error }` (текст ошибки на русском, можно показывать пользователю).

**Сервер → клиент:** `room:state` (состояние комнаты для игрока), `room:kicked`, `session:replaced`, `rooms:changed` (сигнал обновить список комнат).

| Группа | События |
|---|---|
| Сессия и комнаты | `room:create {name, settings}`, `room:join {code, name}`, `session:resume {token}`, `room:leave`, `rooms:watch`, `rooms:unwatch` |
| Лобби | `lobby:ready {ready}`, `lobby:settings {settings}`, `lobby:setModerator {playerId}`, `lobby:kick {playerId}`, `room:transferHost {playerId}` |
| Игра | `game:start`, `game:reveal {key}`, `game:endTurn`, `game:readyToVote`, `game:vote {playerId}`, `game:playAction {targetId?, otherId?, key?}`, `game:backToLobby` |
| Ведущий | `mod:phase {phase, seconds?}`, `mod:speaker {playerId, seconds?}`, `mod:startVoting {candidates?, seconds?}`, `mod:closeVoting`, `mod:exile`, `mod:revive`, `mod:reveal`, `mod:hide`, `mod:reroll`, `mod:swap`, `mod:nextRound`, `mod:finish`, `mod:approveAction {id}`, `mod:rejectAction {id}` |
| Голос | `voice:token` → `{url, token}`, `voice:mute {playerId}` |

**HTTP:** `GET /rooms?q=&mode=AUTO|MODERATED&freeSlots=1&sort=popular|new&limit=` → `{ rooms, total }`.
