const express = require('express');
const { wrap } = require('@awaitjs/express');
const {getRecords, newRecords, updateRecord, getResults} = require('../services/oldsService');

const router = express.Router();

const setup = (app) => {
    router.get('/results/:workerId/', app.oauth.authorise(), wrap(getResults));
    router.get('/:tbl', app.oauth.authorise(), wrap(getRecords));
    router.post('/:tbl', app.oauth.authorise(), wrap(newRecords));
    router.put('/:tbl', app.oauth.authorise(), wrap(updateRecord));

    return router;
};

exports.router = setup;
