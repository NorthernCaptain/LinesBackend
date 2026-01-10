# LinesBackend

Multi-service Express.js backend server (v1.4.0) powering games and applications with authentication, game sessions, scoring, and work tracking.

## Overview

LinesBackend hosts three distinct API modules under a single Express.js umbrella:

| Module | Route Prefix | Purpose |
|--------|--------------|---------|
| **Lines** | `/` | Lines puzzle game API - sessions and leaderboards |
| **Auth** | `/auth` | OAuth 2.0 user authentication |
| **OLDS** | `/oldsdb` | Dress-for-dance work tracking (hours, gems, payments) |

## Project Structure

```
LinesBackend/
├── app.js                      # Main Express app entry point
├── package.json                # Dependencies and scripts
├── errors.js                   # Custom error classes (ApiError, ServerError, ClientError)
│
├── routes/                     # HTTP route handlers
│   ├── lines.js                # Lines game endpoints
│   ├── auth.js                 # Authentication endpoints
│   └── olds.js                 # OLDS work tracking endpoints
│
├── services/                   # Business logic layer
│   ├── linesService.js         # Game session and scoring logic
│   ├── authService.js          # User registration and OAuth
│   └── oldsService.js          # Work tracking logic
│
├── db/                         # Database access layer
│   ├── db.js                   # MySQL connection pools (3 databases)
│   ├── lines.js                # Game session queries
│   ├── auth.js                 # User and token queries
│   └── oldsdb.js               # OLDS queries with dynamic SQL
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
│   └── oldsdb.v2.sql           # Database initialization script
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
    ├── /           → lines.js
    ├── /auth       → auth.js
    └── /oldsdb     → olds.js
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

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session` | POST | Create new game session |
| `/session/update` | POST | Update session with current score |
| `/session/finish` | POST | Finish session and save to leaderboard |
| `/scores/top` | POST | Get top scores for a game mode |

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

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/auth/register` | POST | Required | Register new user |
| `/auth/login` | POST | - | Obtain access token (OAuth grant) |

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

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/oldsdb/results/:workerId` | GET | Get worker results (time, gems, intervals) |
| `/oldsdb/v2/who` | GET | Get current user info |
| `/oldsdb/v2/users` | GET | Get user list (role-restricted) |
| `/oldsdb/:table` | GET | Query any table with filters |
| `/oldsdb/:table` | POST | Insert records |
| `/oldsdb/:table` | PUT | Update records |

All endpoints require OAuth authentication.

#### Features

- Time tracking with start/end timestamps
- Gem/badge reward system with rank multipliers
- USD value calculations for work intervals
- Role-based access control (workers see own data, admins see all)
- Generic CRUD operations on database tables
- Dynamic table introspection

#### Database Tables

| Table | Purpose |
|-------|---------|
| WORKERS | Worker/employee records |
| JOBS | Job assignments with status |
| TIMINGS | Time tracking (start/end) |
| GEMS | Earned badge rewards |
| GEM_LIST | Badge definitions |
| GAPS | Break/gap tracking |
| RANKS | Worker level progression |
| PAYMENTS | Payment records |
| JOB_PAYMENTS | Payment-to-job mapping |
| USERS, ROLES | User management |

#### Example: Get Worker Results

```bash
GET /oldsdb/results/123
Authorization: Bearer <token>
```

Response includes aggregated times, gems earned, work intervals with USD values, and job details.

---

## Database Configuration

Three separate MySQL databases with connection pooling:

| Pool | Database | Purpose |
|------|----------|---------|
| db | linesdb | Lines game sessions and scores |
| authdb | (auth) | User accounts and tokens |
| oldsdb | (olds) | Work tracking data |

### Environment Variables

```bash
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
```

---

## Server Configuration

### Network

- **HTTPS**: Port 8443 (production)
- **HTTP**: Port 10080 (redirects to HTTPS)
- **SSL**: Let's Encrypt certificates at `/etc/letsencrypt/live/lines.navalclash.com/`

### Virtual Hosts

Static file serving based on subdomain:

| Domain | Directory |
|--------|-----------|
| wormit.navalclash.com | public/wormit |
| quadronia.navalclash.com | public/quadronia |
| ncbox.navalclash.com | public/ncbox |
| xnc.navalclash.com | public/xnc |
| navalclash.com | public/navalclash |

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| express | 4.22.1 | Web framework |
| mysql2 | 3.16.0 | MySQL driver (promise-based) |
| @awaitjs/express | 0.6.1 | Async/await middleware |
| ajv | 6.12.6 | JSON schema validation |
| body-parser | 1.19.0 | Request body parsing |
| helmet | 3.22.0 | Security headers |
| node-oauth2-server | 2.4.0 | OAuth 2.0 implementation |
| uuid | 8.0.0 | UUID generation |
| moment | 2.30.1 | Date/time utilities |

---

## Running the Server

### Development

```bash
npm install
node app.js
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

- **v1.4.0**: Migrated from mysql to mysql2/promise with async/await
- **v1.3.x**: Added virtual host-based static file serving
- **v1.2.x**: Security updates (ajv, express, moment)
