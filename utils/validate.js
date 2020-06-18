const Ajv = require('ajv');
const fs = require('fs');
const {ServerError, ClientError} = require('../errors.js');

const jsonv =  new Ajv();

const loadSchema = (path) => {
    return JSON.parse(fs.readFileSync('schemas/' + path).toString());
};

const getSchema = (name) => {
console.log('---', name)
    return jsonv.getSchema(name).schema
};

const addSchema = (name, path, jsonv) => {
    let data = loadSchema(path);
    jsonv.addSchema(data, name);
};

const validate = (data, schemaName) => {
console.log(data)
    if(!jsonv.validate(schemaName, data)) {
        throw new ClientError(jsonv.errorsText());
    }
};

const initValidators = () => {
    addSchema('session_update_resp', 'session_update_resp.json', jsonv);
    addSchema('session_update_req', 'session_update_req.json', jsonv);
    addSchema('session_new_resp', 'session_new_resp.json', jsonv);
    addSchema('session_new_req', 'session_new_req.json', jsonv);
    addSchema('session_finish_resp', 'session_finish_resp.json', jsonv);
    addSchema('session_finish_req', 'session_finish_req.json', jsonv);
    addSchema('top_scores_resp', 'top_scores_resp.json', jsonv);
    addSchema('top_scores_req', 'top_scores_req.json', jsonv);


    addSchema('workers_resp', 'oldsdb/workers_resp.json', jsonv);
    addSchema('jobs_resp', 'oldsdb/jobs_resp.json', jsonv);
    addSchema('gem_list_resp', 'oldsdb/gem_list_resp.json', jsonv);
    addSchema('gems_resp', 'oldsdb/gems_resp.json', jsonv);
    addSchema('timings_resp', 'oldsdb/timings_resp.json', jsonv);

    addSchema('get_req', 'oldsdb/get_req.json', jsonv);
};

exports.jsonv = jsonv;
exports.addSchema = addSchema;
exports.loadSchema = loadSchema;
exports.getSchema = getSchema;
exports.validate = validate;
exports.initValidators = initValidators;