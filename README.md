# LinesBackend

Multi-service Express.js backend server (v1.5.0) powering games and applications with authentication, game sessions, scoring, and work tracking.

## Overview

LinesBackend hosts four distinct API modules under a single Express.js umbrella:

| Module         | Route Prefix          | Purpose                                               |
| -------------- | --------------------- | ----------------------------------------------------- |
| **Lines**      | `/`                   | Lines puzzle game API - sessions and leaderboards     |
| **Auth**       | `/auth`               | OAuth 2.0 user authentication                         |
| **OLDS**       | `/oldsdb`             | Dress-for-dance work tracking (hours, gems, payments) |
| **NavalClash** | `/naval/clash/api/v5` | Multiplayer battleship game - matchmaking and battles |

## Project Structure

```
LinesBackend/
├── app.js                      # Main Express app entry point
├── package.json                # Dependencies, scripts, and Jest config
├── errors.js                   # Custom error classes (ApiError, ServerError, ClientError)
│
├── routes/                     # HTTP route handlers
│   ├── lines.js                # Lines game endpoints
│   ├── auth.js                 # Authentication endpoints
│   ├── olds.js                 # OLDS work tracking endpoints
│   └── navalclash.js           # Naval Clash multiplayer endpoints
│
├── services/                   # Business logic layer
│   ├── linesService.js         # Game session and scoring logic
│   ├── authService.js          # User registration and OAuth
│   ├── oldsService.js          # Work tracking logic
│   └── navalclash/             # Naval Clash services
│       └── connectService.js   # Session/matchmaking logic
│
├── db/                         # Database access layer
│   ├── db.js                   # MySQL connection pools (3 databases)
│   ├── lines.js                # Game session queries
│   ├── auth.js                 # User and token queries
│   ├── oldsdb.js               # OLDS queries with dynamic SQL
│   └── navalclash/             # Naval Clash database layer
│       ├── pool.js             # MySQL connection pool with BigInt
│       ├── users.js            # User CRUD operations
│       ├── devices.js          # Device tracking
│       ├── sessions.js         # Game session management
│       ├── messages.js         # Message queue
│       ├── social.js           # Friends, blocked, search
│       ├── leaderboard.js      # Top scores
│       ├── shop.js             # Purchases and inventory
│       └── index.js            # Re-exports all modules
│
├── utils/                      # Utilities
│   ├── validate.js             # JSON schema validation (AJV)
│   ├── respond.js              # Response formatting
│   └── rebuild.js              # GitHub webhook auto-update
│
├── schemas/                    # JSON validation schemas
│   ├── session_*.json          # Game session schemas
│   ├── top_scores_*.json       # Leaderboard schemas
│   ├── auth/                   # Authentication schemas
│   └── oldsdb/                 # OLDS schemas
│
├── sql/
│   ├── oldsdb.v2.sql           # OLDS database initialization
│   └── navalclash/             # Naval Clash database scripts
│       ├── 001_schema.sql      # Database creation
│       ├── 002_users.sql       # Users table
│       ├── 003_devices.sql     # Devices table
│       ├── 004_sessions.sql    # Game sessions
│       ├── 005_messages.sql    # Message queue
│       ├── 006_gamefields.sql  # Game field storage
│       ├── 007_userlist.sql    # Friends/blocked lists
│       ├── 008_topscore.sql    # Leaderboard
│       ├── 009_gamesetup.sql   # Configuration
│       ├── 010_billing.sql     # Purchases/inventory
│       └── 011_views.sql       # Database views
│
├── auth/
│   └── authenticator.js        # OAuth middleware
│
├── linesbackend.service        # SystemD service file
└── notes.txt                   # Deployment notes
```

## Architecture

```
HTTP Request
    ↓
[Helmet Security Headers]
    ↓
[HTTP → HTTPS Redirect]
    ↓
[Body Parser (JSON/URL-encoded)]
    ↓
[Virtual Host Static Serving]
    ↓
[Route Handler]
    ├── /                   → lines.js
    ├── /auth               → auth.js
    ├── /oldsdb             → olds.js
    └── /naval/clash/api/v5 → navalclash.js
    ↓
[OAuth Middleware - if required]
    ↓
[Service Layer - validation & business logic]
    ↓
[Database Layer - mysql2/promise]
    ↓
[Response Formatting & Schema Validation]
    ↓
JSON Response
```

---

## API Modules

### 1. Lines Game API

Manages game sessions and leaderboards for the Lines puzzle game (place same-color balls in rows of 5 to clear them).

#### Endpoints

| Endpoint          | Method | Description                            |
| ----------------- | ------ | -------------------------------------- |
| `/session`        | POST   | Create new game session                |
| `/session/update` | POST   | Update session with current score      |
| `/session/finish` | POST   | Finish session and save to leaderboard |
| `/scores/top`     | POST   | Get top scores for a game mode         |

#### Game Flow

1. **Start**: Client creates session, receives UUID
2. **Play**: Client sends periodic updates with score/level
3. **Finish**: Client sends final score with username for leaderboard
4. **Ranking**: Server calculates position among all players

#### Example: New Session

```bash
POST /session
Content-Type: application/json

{"app": "lines", "version": "0.7.0"}
```

Response:

```json
{
    "success": true,
    "data": {
        "uuid": "7b895b4d-3dcd-4b3e-ac46-e009558b485e",
        "ip": "192.168.1.1",
        "version": "0.7.0",
        "id": 22
    }
}
```

#### Database Tables

- **game_session**: Active sessions (uuid, ip, version, score, level, pings, is_finished)
- **game_scores**: Leaderboard entries (user_name, score, level, game_type, seconds_played)

---

### 2. Authentication API

OAuth 2.0 token-based authentication with user registration.

#### Endpoints

| Endpoint         | Method | Auth     | Description                       |
| ---------------- | ------ | -------- | --------------------------------- |
| `/auth/register` | POST   | Required | Register new user                 |
| `/auth/login`    | POST   | -        | Obtain access token (OAuth grant) |

#### Features

- User registration with email/password
- SHA256 password hashing
- OAuth 2.0 password grant flow
- Access tokens with 12-hour lifetime
- Client credential validation

#### Example: User Registration

```bash
POST /auth/register
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}
```

#### Database Tables

- **users**: User accounts (user_id, email, password, name)
- **access_tokens**: Active tokens (token, user_id, expires_at)
- **client_tokens**: OAuth client credentials

---

### 3. OLDS (Work Tracking) API

Comprehensive work tracking system for dress-for-dance project. Tracks working hours, gem/badge rewards, and payments.

#### Endpoints

| Endpoint                    | Method | Description                                |
| --------------------------- | ------ | ------------------------------------------ |
| `/oldsdb/results/:workerId` | GET    | Get worker results (time, gems, intervals) |
| `/oldsdb/v2/who`            | GET    | Get current user info                      |
| `/oldsdb/v2/users`          | GET    | Get user list (role-restricted)            |
| `/oldsdb/:table`            | GET    | Query any table with filters               |
| `/oldsdb/:table`            | POST   | Insert records                             |
| `/oldsdb/:table`            | PUT    | Update records                             |

All endpoints require OAuth authentication.

#### Features

- Time tracking with start/end timestamps
- Gem/badge reward system with rank multipliers
- USD value calculations for work intervals
- Role-based access control (workers see own data, admins see all)
- Generic CRUD operations on database tables
- Dynamic table introspection

#### Database Tables

| Table        | Purpose                     |
| ------------ | --------------------------- |
| WORKERS      | Worker/employee records     |
| JOBS         | Job assignments with status |
| TIMINGS      | Time tracking (start/end)   |
| GEMS         | Earned badge rewards        |
| GEM_LIST     | Badge definitions           |
| GAPS         | Break/gap tracking          |
| RANKS        | Worker level progression    |
| PAYMENTS     | Payment records             |
| JOB_PAYMENTS | Payment-to-job mapping      |
| USERS, ROLES | User management             |

#### Example: Get Worker Results

```bash
GET /oldsdb/results/123
Authorization: Bearer <token>
```

Response includes aggregated times, gems earned, work intervals with USD values, and job details.

---

### 4. Naval Clash API

Multiplayer battleship game with real-time matchmaking, game sessions, and social features.

#### Endpoints

| Endpoint     | Method | Description                               |
| ------------ | ------ | ----------------------------------------- |
| `/connect`   | POST   | Connect player and find/create game match |
| `/reconnect` | POST   | Reconnect to existing game session        |

#### Features

- **Snowflake-style Session IDs**: 48-bit timestamp + 10-bit worker + 5-bit sequence + 1-bit player
- **Player Encoding**: Session ID's last bit encodes player (even = player 0, odd = player 1)
- **Opponent Lookup**: XOR session ID with 1 to get opponent's session ID
- **Automatic Matchmaking**: Join waiting sessions or create new ones
- **Device Tracking**: Track Android devices with model info
- **Social Features**: Friends list, blocked users, recent opponents
- **Leaderboards**: Track wins, stars, and rankings
- **In-app Purchases**: Coin system with inventory management

#### Session ID Format

```
| 48 bits timestamp | 10 bits worker | 5 bits sequence | 1 bit player |
```

- Player 0 gets even session ID (base)
- Player 1 gets odd session ID (base + 1)
- Opponent's session ID = `mySessionId XOR 1`

#### Example: Connect

```bash
curl -X POST http://localhost:10080/naval/clash/api/v5/connect \
  -H "Content-Type: application/json" \
  -d '{
    "type": "connect",
    "player": "Captain",
    "uuuid": "device-uuid-123",
    "var": 1
  }'
```

Response:

```json
{
    "type": "connected",
    "sid": "1234567890123456",
    "u": {
        "id": 1,
        "n": "Captain",
        "pin": 5678,
        "f": 0,
        "r": 0,
        "s": 0,
        "g": 0,
        "w": 0,
        "c": 0
    }
}
```

#### Example: Reconnect

```bash
curl -X POST http://localhost:10080/naval/clash/api/v5/reconnect \
  -H "Content-Type: application/json" \
  -d '{"sid": "1234567890123456"}'
```

#### Database Tables

| Table        | Purpose                              |
| ------------ | ------------------------------------ |
| users        | Player accounts with stats and coins |
| devices      | Device tracking (Android ID, model)  |
| user_devices | User-to-device mapping               |
| sessions     | Game sessions with status            |
| messages     | Message queue between players        |
| gamefields   | Stored game board states             |
| userlists    | Friends and blocked lists            |
| topscore     | Leaderboard entries                  |
| gamesetup    | Configuration key-value store        |
| purchases    | In-app purchase records              |
| inventory    | User inventory items                 |

---

## Database Configuration

Four separate MySQL databases with connection pooling:

| Pool       | Database   | Purpose                           |
| ---------- | ---------- | --------------------------------- |
| db         | linesdb    | Lines game sessions and scores    |
| authdb     | (auth)     | User accounts and tokens          |
| oldsdb     | (olds)     | Work tracking data                |
| navalclash | navalclash | Naval Clash multiplayer game data |

### Environment Variables

```bash
# Cluster configuration
CLUSTER_WORKERS=4          # Number of worker processes (defaults to CPU count)
WORKER_ID=1                # Worker ID for session ID generation (auto-assigned in cluster mode)

db_host=localhost

# Lines database
db_database=linesdb
db_user=linesuser
db_password=secret

# OLDS database
db_olds_database=oldsdb
db_olds_user=oldsuser
db_olds_password=secret

# Auth database
db_auth_database=authdb
db_auth_user=authuser
db_auth_password=secret

# Naval Clash database
db_navalclash_database=navalclash
db_navalclash_user=navaluser
db_navalclash_password=secret
```

---

## Server Configuration

### Network

- **HTTPS**: Port 8443 (production)
- **HTTP**: Port 10080 (redirects to HTTPS)
- **SSL**: Let's Encrypt certificates at `/etc/letsencrypt/live/lines.navalclash.com/`

### Virtual Hosts

Static file serving based on subdomain:

| Domain                   | Directory         |
| ------------------------ | ----------------- |
| wormit.navalclash.com    | public/wormit     |
| quadronia.navalclash.com | public/quadronia  |
| ncbox.navalclash.com     | public/ncbox      |
| xnc.navalclash.com       | public/xnc        |
| navalclash.com           | public/navalclash |

---

## Dependencies

| Package            | Version | Purpose                      |
| ------------------ | ------- | ---------------------------- |
| express            | 4.22.1  | Web framework                |
| mysql2             | 3.16.0  | MySQL driver (promise-based) |
| @awaitjs/express   | 0.6.1   | Async/await middleware       |
| ajv                | 6.12.6  | JSON schema validation       |
| body-parser        | 1.19.0  | Request body parsing         |
| helmet             | 3.22.0  | Security headers             |
| node-oauth2-server | 2.4.0   | OAuth 2.0 implementation     |
| uuid               | 8.0.0   | UUID generation              |
| moment             | 2.30.1  | Date/time utilities          |

### Dev Dependencies

| Package  | Version | Purpose           |
| -------- | ------- | ----------------- |
| jest     | 29.7.0  | Testing framework |
| prettier | 3.4.2   | Code formatting   |

---

## Testing

The project uses Jest for unit testing with comprehensive coverage of the Naval Clash module.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-run on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test Structure

Each source file has a corresponding `.test.js` file:

```
db/navalclash/
├── pool.js          → pool.test.js
├── users.js         → users.test.js
├── devices.js       → devices.test.js
├── sessions.js      → sessions.test.js
├── messages.js      → messages.test.js
├── social.js        → social.test.js
├── leaderboard.js   → leaderboard.test.js
├── shop.js          → shop.test.js
└── index.js         → index.test.js

routes/
└── navalclash.js    → navalclash.test.js

services/navalclash/
└── connectService.js → connectService.test.js
```

### Test Coverage

Tests cover:

- **130+ test cases** across 11 test suites
- Database layer functions with mocked MySQL pool
- Route configuration and endpoint setup
- Connect service including session ID generation, matchmaking, and user serialization
- Error handling and edge cases

### Example Test Output

```
 PASS  db/navalclash/users.test.js
 PASS  db/navalclash/sessions.test.js
 PASS  db/navalclash/messages.test.js
 PASS  services/navalclash/connectService.test.js
 ...

Test Suites: 11 passed, 11 total
Tests:       130 passed, 130 total
```

---

## Running the Server

### Development

```bash
npm install
node app.js
```

### Cluster Mode

The server uses Node.js cluster module to spawn multiple worker processes for better performance and reliability.

```bash
# Use specific number of workers
CLUSTER_WORKERS=4 node app.js

# Use all available CPUs (default)
node app.js
```

**Cluster features:**

- Master process manages worker lifecycle
- Workers automatically restart on crash (2 second delay)
- Each worker receives a unique auto-incrementing ID (starting from 1)
- Worker IDs always increase, even after restarts (for tracking/debugging)

**Example output:**

```
Master process 1234 starting 4 workers...
Worker 1 started with PID 1235
Worker 2 started with PID 1236
Worker 1 (PID 1235) initializing...
Server 1.4.0 worker 1 started, UID is now 501
...

# If worker 2 crashes:
Worker 2 (PID 1236) died with code 1, signal null. Restarting in 2 seconds...
Worker 5 started with PID 1240   # New ID is 5, not 2
```

### Production (SystemD)

```bash
sudo systemctl start linesbackend
sudo systemctl enable linesbackend
```

### Auto-Update

The server includes a GitHub webhook handler at `/update/on/push` that triggers automatic updates when changes are pushed to the master branch.

---

## Error Handling

All responses follow a consistent format:

**Success:**

```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**

```json
{
    "success": false,
    "error": "Error message"
}
```

**OAuth Error:**

```json
{
    "success": false,
    "error": "Unauthorized",
    "auth": "expired"
}
```

---

## Version History

- **v1.5.0**: Added cluster mode with configurable workers and auto-restart
- **v1.4.0**: Migrated from mysql to mysql2/promise with async/await
- **v1.3.x**: Added virtual host-based static file serving
- **v1.2.x**: Security updates (ajv, express, moment)
