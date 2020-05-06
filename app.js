const express = require('express');
const fs = require('fs');
const https = require('https');
const bodyParser = require('body-parser');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(bodyParser.json());
app.use(express.static('public'));
//redirect all http traffic to https
app.use(function(req, res, next) {
    if(!req.secure) {
        return res.redirect(['https://', req.get('Host'), req.baseUrl].join(''));
    }
    next();
});

const privateKey  = fs.readFileSync('etc/letsencrypt/live/lines.navalclash.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('etc/letsencrypt/live/lines.navalclash.com/fullchain.pem', 'utf8');
const credentials = {key: privateKey, cert: certificate};

const httpsServer = https.createServer(credentials, app);
httpsServer.listen(8443, '0.0.0.0', (err) => {
        if (err) {
            console.error("ERROR: ", err);
        }
        console.log('Server started, UID is now ' + process.getuid());
});

app.listen(10080, '0.0.0.0');
