const {newSession, updateSession, finishSession, topGameScores} = require('./session');
const express = require('express');
const fs = require('fs');
const https = require('https');
const bodyParser = require('body-parser');
const helmet = require('helmet');

const app = express();
app.use(helmet());
//redirect all http traffic to https
app.use(function(req, res, next) {
    if(!req.secure) {
        return res.redirect(['https://', req.get('Host'), req.baseUrl].join(''));
    }
    next();
});

app.use(bodyParser.json());
app.use(express.static('public'));

// request: curl -X POST http://localhost:10080/session -H "Content-Type: application/json" -d '{"version":"0.5.1"}'
// response: {"success":true,"data":{"uuid":"7b8c44e7-432b-47ef-afd4-e455169b54f9","ip":"127.0.0.1","version":"0.5.1","id":1}}
app.post('/session', newSession);

//request: curl -X POST http://localhost:10080/session/update -H "Content-Type: application/json" -d '{"version":"0.5.1","uuid":"5cc0b960-47fb-47de-b4e1-80ce6c244f3c","score":25, "level": 1, "mode": "easy"}'
//response: {"success":true,"data":{"uuid":"5cc0b960-47fb-47de-b4e1-80ce6c244f3c","ip":"127.0.0.1","score":25}}
app.post('/session/update', updateSession);

//request: curl -X POST http://localhost:10080/session/finish -H "Content-Type: application/json" -d '{"version":"0.5.1","uuid":"5cc0b960-47fb-47de-b4e1-80ce6c244f3c","score":25, "level": 1, "mode": "easy", "user":"Leo"}'
//response: {"success":true,"data":{"uuid":"5cc0b960-47fb-47de-b4e1-80ce6c244f3c","ip":"127.0.0.1","score":25,"level":1,"mode":"easy","user":"Leo","done":1,"id":3}}
app.post('/session/finish', finishSession);

//request: curl -X POST http://localhost:10080/scores/top -H "Content-Type: application/json" -d '{"version":"0.5.1","mode":"easy","limit":25}'
//response: {"success":true,"data":[{"num":1,"id":5,"user_name":"Leo2","score":83,"date_created":"2020-05-23T01:34:25.000Z","level":3,"seconds_played":3771,"game_type":"easy","session_id":2},{"num":2,"id":4,"user_name":"Leo","score":53,"date_created":"2020-05-23T01:31:44.000Z","level":2,"seconds_played":-3610,"game_type":"easy","session_id":2},{"num":3,"id":6,"user_name":"Leo3","score":43,"date_created":"2020-05-23T01:51:12.000Z","level":3,"seconds_played":4778,"game_type":"easy","session_id":2}]}
app.post('/scores/top', topGameScores);

const privateKey  = fs.readFileSync('etc/letsencrypt/live/lines.navalclash.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('etc/letsencrypt/live/lines.navalclash.com/fullchain.pem', 'utf8');
const credentials = {key: privateKey, cert: certificate};

const httpsServer = https.createServer(credentials, app);
httpsServer.listen(8443, '0.0.0.0', (err) => {
        if (err) {
            console.error("ERROR: ", err);
        }
        console.log('Server 1.0.0 started, UID is now ' + process.getuid());
});

app.listen(10080, '0.0.0.0');
