# Naval Clash Backend - Development Guidelines

## Logging Conventions

### Logger Usage

Import the logger from utils/logger.js:

```javascript
const { logger } = require("../../utils/logger")
```

### Log Format

All logs automatically include timestamp, process ID, and worker ID:
```
YYYY-MM-DD HH:mm:ss.SSS pid:workerId: LEVEL [context] message
```

Example output:
```
2026-01-10 14:32:15.123 12345:2: INFO [sid=115873854376116224 uid=42] User connected successfully
```

### Log Levels

- `DEBUG` - Detailed flow information for debugging (polls, message routing, internal state)
- `INFO` - Important events (connections, session creation, message sent)
- `WARN` - Unexpected but recoverable conditions (missing optional fields)
- `ERROR` - Failures requiring attention (database errors, invalid requests)

Set log level via environment variable:
```
LOG_LEVEL=INFO  # Only show INFO, WARN, ERROR
LOG_LEVEL=DEBUG # Show all logs (default)
```

### Context Object

Always pass a context object as the first argument with relevant IDs:

```javascript
// Good - includes context for traceability
logger.info({ sid: sessionId, uid: userId }, "User connected")

// Bad - no context
logger.info({}, "User connected")
```

Common context fields:
- `reqId` - Request ID (8-char UUID, set by middleware on `req.requestId`)
- `sid` - Session ID (full BigInt as string)
- `uid` - User ID
- `gid` - Game ID
- `did` - Device ID
- `workerId` - Cluster worker ID
- `msgId` - Message ID
- `msgType` - Message type

### Logging Patterns

#### Entry points (request handlers)
```javascript
async function connect(req, res) {
    const ctx = { uid: req.body.uid }
    logger.debug(ctx, "Connect request received")
    // ... process request
    logger.info({ ...ctx, sid: sessionId }, "Connect successful")
}
```

#### Decision points
```javascript
if (existingSession) {
    logger.debug(ctx, "Found existing session, joining")
} else {
    logger.debug(ctx, "No existing session, creating new")
}
```

#### Errors
```javascript
try {
    // ... operation
} catch (error) {
    logger.error(ctx, "Database error:", error.message)
    return res.json({ type: "error", reason: "Server error" })
}
```

#### IPC/Cluster communication
```javascript
logger.debug(
    { sid: sessionId, reqId: requestId?.substring(0, 8), workerId: poll.workerId },
    "Waking receiver poll"
)
```

### Child Loggers

For request-scoped logging with preset context:

```javascript
const { createLogger } = require("../../utils/logger")

function handleRequest(req, res) {
    const log = createLogger({ reqId: req.requestId, uid: req.body.uid })
    log.info({}, "Processing request")  // Includes reqId and uid automatically
    log.debug({ step: 1 }, "Step 1 complete")  // Merges contexts
}
```

## Session ID Conventions

Session IDs use a Snowflake-style format:
- 48-bit timestamp
- 10-bit worker ID
- 5-bit sequence
- 1-bit player indicator (last bit)

Player identification:
- Even session ID = Player 0
- Odd session ID = Player 1
- Opponent's session ID = `sessionId XOR 1`

Always store/log session IDs as strings to preserve full precision.
