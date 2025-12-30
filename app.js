const {initValidators} = require('./utils/validate');
const {expressErrorHandler} = require('./errors');
const {setServers, githubPushEvent} = require('./utils/rebuild');
const express = require('express');
const fs = require('fs');
const https = require('https');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const { wrap } = require('@awaitjs/express');
const oAuth2Server = require("node-oauth2-server");
const authModel = require('./services/authService').model;
const linesRouterFunc = require('./routes/lines').router;
const oldsRouterFunc = require('./routes/olds').router;
const authRouterFunc = require('./routes/auth').router;

const app = express();
app.oauth = oAuth2Server({
    model: authModel,
    grants: ["password"],
    debug: true,
    accessTokenLifetime: 3600*12
});

app.use(helmet());
//redirect all http traffic to https
app.use(function(req, res, next) {
    if(!req.secure) {
        return res.redirect(['https://', req.get('Host'), req.baseUrl].join(''));
    }
    next();
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.text());
app.use(bodyParser.urlencoded({ extended: true }));
// Virtual host static file serving
app.use((req, res, next) => {
    const host = req.hostname;
    let staticPath = 'public'; // default

    if (host === 'wormit.navalclash.com') {
        staticPath = 'public/wormit';
    } else if (host === 'quadronia.navalclash.com') {
        staticPath = 'public/quadronia';
    } else if (host === 'ncbox.navalclash.com') {
        staticPath = 'public/ncbox';
    } else if (host === 'xnc.navalclash.com') {
        staticPath = 'public/xnc';
    } else if (host === 'navalclash.com' || host === 'www.navalclash.com') {
        staticPath = 'public/navalclash';
    }

    express.static(staticPath)(req, res, next);
});
app.use(app.oauth.errorHandler());
app.use('/oldsdb', oldsRouterFunc(app));
app.use('/', linesRouterFunc(app));
app.use('/auth', authRouterFunc(app));

app.post('/update/on/push', wrap(githubPushEvent));

app.use(expressErrorHandler);

initValidators();

const privateKey  = fs.readFileSync('etc/letsencrypt/live/lines.navalclash.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('etc/letsencrypt/live/lines.navalclash.com/fullchain.pem', 'utf8');
const credentials = {key: privateKey, cert: certificate};

const httpsServer = https.createServer(credentials, app);
httpsServer.listen(8443, '0.0.0.0', (err) => {
        if (err) {
            console.error("ERROR: ", err);
        }
        console.log(`Server 1.4.0 started, UID is now ${process.getuid ? process.getuid() : ''}`);
});

const httpServer = app.listen(10080, '0.0.0.0');

setServers([httpServer, httpsServer]);
