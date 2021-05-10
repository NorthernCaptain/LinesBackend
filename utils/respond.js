const {jsonv} = require('./validate.js')
const {ServerError, ClientError} = require('../errors.js');

const respond = (data, schemaName, res) => {
    let msg = { success: true, data: data };
    if(schemaName === "skip" || jsonv.validate(schemaName, msg)) {
        res.json(msg)
    } else {
        throw new ServerError(jsonv.errorsText());
    }
};

exports.respond = respond;