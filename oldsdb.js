const { v4: uuid } = require('uuid');
const mysql = require('mysql');
const {ServerError, ClientError} = require('./errors');
const {addSchema, loadSchema, getSchema, validate, jsonv} = require('./utils/validate.js')
const {respond} = require('./utils/respond.js')


const tables = loadSchema('oldsdb/tables.json')

const inArray = (arr, obj) => {
    if (Array.isArray(arr)){
        for (let el in arr){
            if (arr[el] === obj){ return true}
        }
    }
    return false
}

const db = mysql.createPool({
    connectionLimit: 10,
    host: process.env[`db_host`],
    database: process.env[`db_olds_database`],
    user: process.env[`db_olds_user`],
    password: process.env[`db_olds_password`],
    timezone: 'Z'
});

const dbGetRecord = (sql, session) => {
console.log(sql, session)
    return new Promise((resolve => {
        db.query(sql, session, (error, result) => {
                if(error) console.log("ERROR selecting top game scores ", error, session);
                resolve(result ? result : [])
            })
    }))
}



const newRecords = async (req, res) => {
};

const updateRecord = async (req, res) => {
};

const getRecords = async (req, res) => {

    let table = req.params.tbl.toLowerCase();
    let table_name = tables[table];
    if ( !table_name ) {
        throw new ServerError('---');
    }
//    let req_schema = `${table}_get_req`;
    let req_schema = `get_req`;
    let resp_schema = `${table}_resp`;
    let query = req.query;
    let t = {[table_name]: true};

    validate({...query,...t}, req_schema);

    let schema = getSchema(resp_schema)
    let props = schema.properties.data.items.properties
    if ( !props ) {
        throw new ServerError('missing schema');
    }
    let columns = [];
    for ( let i in props ){
        columns.push(i)
    }
    columns = columns.join(', ')

    let where = [];
    let params = [];

    for ( let key in query ) {
        where.push(`${key} = ?`);
        params.push(query[key]);
    }

    let limit_ = where.length == 0 ? 'LIMIT 100' : ''
    where = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''
    sql = `SELECT ${columns} FROM ${tables[table]} ${where} ${limit_};`

    data = await dbGetRecord(sql, params);
    console.log(data)
    respond(data, resp_schema, res);
};


exports.newRecords = newRecords;
exports.updateRecord = updateRecord;
exports.getRecords = getRecords;
