const express = require('express');
const { wrap } = require('@awaitjs/express');
const {getRecords, newRecords, updateRecord} = require('../services/oldsService');

const router = express.Router();

const setup = (app) => {
    router.get('/:tbl', wrap(getRecords));
    router.post('/:tbl', wrap(newRecords));
    router.put('/:tbl', wrap(updateRecord));

    return router;
};

exports.router = setup;
