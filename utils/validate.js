const Ajv = require('ajv');
const fs = require('fs');

const jsonv =  new Ajv();

const addSchema = (name, path, jsonv) => {
    let data = JSON.parse(fs.readFileSync('schemas/' + path).toString());
    jsonv.addSchema(data, name);
};

const loadSchema = (path) => {
    return JSON.parse(fs.readFileSync('schemas/' + path).toString());
};

const validate = (data, schemaName) => {
    if(!jsonv.validate(schemaName, data)) {
        console.log(jsonv)
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

    addSchema('gem_list_resp', 'oldsdb/gem_list_resp.json', jsonv);
};

exports.jsonv = jsonv;
exports.addSchema = addSchema;
exports.loadSchema = loadSchema;
exports.validate = validate;
exports.initValidators = initValidators;