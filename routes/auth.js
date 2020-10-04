const express = require('express');
const { wrap } = require('@awaitjs/express');
const {registerUser, loginUser} = require('../services/authService');

const router = express.Router();

const setup = (app) => {
    router.post('/register', app.oauth.authorise(), wrap(registerUser));
    router.post('/login', app.oauth.grant(), loginUser);

    return router;
};

exports.router = setup;
