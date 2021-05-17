const express = require('express');
const { wrap } = require('@awaitjs/express');
const {getRecords, newRecords, updateRecord,   getResults, getLoggedUser, getUsers} = require('../services/oldsService');
const {ClientError} = require('../errors');

const router = express.Router();

const setup = (app) => {
    router.get('/results/:workerId/', app.oauth.authorise() , wrap(getResults));
    router.get('/v2/who', app.oauth.authorise() , wrap(getLoggedUser));
    router.get('/v2/users', app.oauth.authorise() , wrap(getUsers));
    router.get('/users', app.oauth.authorise() , wrap((req, res) => {throw new ClientError('?');}));
    router.get('/:tbl', app.oauth.authorise(), wrap(getRecords));
    router.post('/:tbl', app.oauth.authorise(), wrap(newRecords));
    router.put('/:tbl', app.oauth.authorise(), wrap(updateRecord));

    return router;
};

exports.router = setup;
