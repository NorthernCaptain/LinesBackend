const express = require('express');

const initExpress = require('./loaders/express').init;
const startServers = require('./loaders/express').startServers;

const app = express();

initExpress(app);
startServers(app);
