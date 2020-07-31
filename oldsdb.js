const { v4: uuid } = require('uuid');
const mysql = require('mysql');
const {ServerError, ClientError} = require('./errors');
const {addSchema, loadSchema, getSchema, validate, jsonv} = require('./utils/validate.js')
const {respond} = require('./utils/respond.js')

const resp_schema = "response";
const req_schema = "get_req";

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

const dbRunSQL = (sql, subst) => {
    return new Promise(((resolve, reject) => {
        db.query(sql,
                subst,
                (error, result) => {
                let op = sql.split(" ")[0].toUpperCase();
                    if(error) {
                        console.log("DB ${op} ERROR: ", error.sqlMessage);
                        console.log("Data    : ", subst);
                        reject(`${op} failed: ${ error.sqlMessage}`);
                        }

                    switch(op){
                        case "INSERT":
                            res = result ? result.insertId : null;
                            break;
                        case "UPDATE":
                            res = result ? result.affectedRows : null;
                            if(res===0){
                                reject(`${op} failed: ${result.message} :: [${subst}]`);
                            }
                            break;
                        case "DELETE":
                            res = "OK";
                            break;
                        default:
                            res = result ? result : [];
                    }
                    resolve(res)
                })
        }))
    }

const getColumns = () => {
    let sql = `
        SELECT TABLE_NAME as tbl,
            COLUMN_NAME as col,
            IF(IS_NULLABLE='Yes',1,0) as "null",
            IF(COLUMN_KEY IN ('PRI'),1,0) as "key",
            IF(EXTRA = 'auto_increment',1,0) as auto
        FROM information_schema.COLUMNS WHERE Table_schema = 'oldsdb';
        `;
    return new Promise((resolve => {
        db.query(sql, (error, result) => {
                if(error) console.log("ERROR : ", error);
                resolve(result ? result : [])
            })
    }))

};

const getTables = async () => {
    let tables = loadSchema('oldsdb/tables.json')
    let columns = await getColumns()
    for (let n in columns){
        let key_ = Object.keys(tables).find(key => tables[key].name === columns[n].tbl);
        if (columns[n].auto) { tables[key_].auto.push(columns[n].col.toLowerCase())};
        if (columns[n]["key"]) {tables[key_].keys.push(columns[n].col.toLowerCase())};
        if (columns[n].null) {tables[key_].nulls.push(columns[n].col.toLowerCase())};
    }
    return tables
};

const tableColumns = (table, schema) => {
    schema = getSchema(schema ? schema : 'response');
    let props= schema.definitions[`${table}_row`].properties;
    if ( !props ) {
        throw new ServerError('missing schema');
    }
    let columns = [];
    for ( let i in props ){
        columns.push(i);
    }
    return columns.join(', ');
    }

let tables = [];
getTables().then(res => {tables = res;});

const getRecords = async (req, res) => {
    let table = req.params.tbl.toLowerCase();
    let table_name = tables[table].name;
    if ( !table_name ) {
        throw new ServerError('Oooops!!!');
    }
    let query = req.query;
    console.log(`New GET - ${table}`)
    validate({...query,...{[table_name]: true}}, req_schema);

    let where = [];
    let params = [];

    for ( let key in query ) {
        where.push(`${key} = ?`);
        params.push(query[key]);
    }

    let limit_ = where.length == 0 ? 'LIMIT 100' : ''
    where = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''
    sql = `SELECT ${tableColumns(table)} FROM ${table_name} ${where} ${limit_};`
    try {
        data = await dbRunSQL(sql, params);
        }
    catch (ex) {
        throw new ServerError(ex, values);
        }
    if (data.length == 0){
        data.push(null);
        }

    respond(data, resp_schema, res);
    console.log(`  Success: ${data.length}`)
};

const newRecords = async (req, res) => {
    let data = req.body;
    let table = req.params.tbl ? req.params.tbl.toLowerCase() : "notable";
    console.log(`New POST request - ${table}\n    ${JSON.stringify(data)}`);
    let table_name;
    try {
        table_name = tables[table].name;
        }
    catch {
        throw new ClientError(404);
        }
    validate(data, 'response');
    if (!data.request_data){
        throw new ServerError('No data in request');
        }
    let columns = []
    for (let column_name in data.request_data[0]){
        if (!inArray(tables[table].auto, column_name)){
        columns.push(column_name);
        }
    }
    if (columns.length === 0){
        throw new ServerError('No data provided for insert');
    }
    let column_list = columns.join(', ');
    let ids = [];

    for (let rownumber in data.request_data){
        let values = [];
        for (let column_name in columns){
            values.push(data.request_data[rownumber][columns[column_name]]);
            }
        sql = `INSERT INTO
            ${table_name}(${column_list})
            VALUES(${Array(columns.length).fill('?').join(',')});`
        try {
            id = await dbRunSQL(sql, values);
            }
        catch (ex) {
            throw new ServerError(ex, values);
            }
        if (!(id === null) && tables[table].keys.length === 1) {
            data.request_data[rownumber][tables[table].keys[0]] = id;
            ids.push(`'${id}'`);
            }
        }
    let data_;
    if (ids.length >0){
        let in_ = ids.join(', ');
        sql = `SELECT ${tableColumns(table)}
               FROM ${table_name}
               WHERE ${tables[table].keys[0]} IN (${in_});`
        data_ = await dbRunSQL(sql);
    } else {
        data_ = {"rows": data.request_data.length};
        }
    respond(data_, resp_schema, res);
    console.log(`  Success: ${data_}`)
};

const updateRecord = async (req, res) => {
    let data = req.body;
    let table = req.params.tbl ? req.params.tbl.toLowerCase() : "notable";
    console.log(`New PUT request - ${table}\n    ${JSON.stringify(data)}`);
    let table_name;
    try {
        table_name = tables[table].name;
        }
    catch {
        throw new ClientError(404);
        }
    validate(data, 'response');
    if (!data.request_data){
        throw new ServerError('No data in request');
        }
    data = data.request_data;
    let changed = 0;
    for(rownumber in data){
        let row = data[rownumber];
        let set_ = [];
        let where_ = [];
        let subst_s = [];
        let subst_w = [];
        for (let column_name in row){
            let key_ = inArray(tables[table].keys, column_name);
            if (key_){
                where_.push(`${column_name} = ?`);
                subst_w.push(row[column_name]);
            } else {
                set_.push(`${column_name} = ?`);
                subst_s.push(row[column_name]);
            }

        }
        sql = `UPDATE ${table_name}
                SET ${set_.join(", ")}
                WHERE ${where_.join(" AND ")};
                `;
        try{
            changed += await dbRunSQL(sql,[...subst_s, ...subst_w]);
        }
        catch (ex){
            throw new ServerError(ex);
        }
    }
        respond({"rows": changed}, resp_schema, res);
        console.log(`  Success: ${changed}`)
};

exports.newRecords = newRecords;
exports.updateRecord = updateRecord;
exports.getRecords = getRecords;
