const express = require('express');
const fs = require('fs');
const https = require('https');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const oAuth2Server = require("node-oauth2-server");

const {initValidators} = require('../utils/validate');
const {expressErrorHandler} = require('../errors');
const {setServers} = require('../utils/rebuild');
const authModel = require('../services/authService').model;
const initRoutes = require('./routes').init;

const initExpress = (app) => {
    //authentication
    app.oauth = oAuth2Server({
        model: authModel,
        grants: ["password"],
        debug: true,
        accessTokenLifetime: 3600*12
    });

    //strip headers
    app.use(helmet());

    //redirect all http traffic to https
    // app.use(function(req, res, next) {
    //     if(!req.secure) {
    //         return res.redirect(['https://', req.get('Host'), req.baseUrl].join(''));
    //     }
    //     next();
    // });

    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());
    app.use(bodyParser.text());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(express.static('public'));
    app.use(app.oauth.errorHandler());

    initRoutes(app);

    app.use(expressErrorHandler);

    initValidators();
}

const startServers = (app) => {
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
}

exports.init = initExpress;
exports.startServers = startServers;