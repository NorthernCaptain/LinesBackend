const {ServerError} = require('../errors');
const {loadSchema, getSchema} = require('../utils/validate.js')
const db = require('./db').oldsdb;

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
                let res = null;
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
        let column = columns[n];
        let table =  tables[column.tbl.toLowerCase()];
        if (typeof table === 'undefined') {
            console.error(`No table ${column.tbl} found in tables.json` )
        } else {
            if (column.auto) {table.auto.push(column.col.toLowerCase())};
            if (column.key) {table.keys.push(column.col.toLowerCase())};
            if (column.null) {table.nulls.push(column.col.toLowerCase())};
        }
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

let tables = {};
getTables().then(res => {tables = res;});

exports.getTables = () => { return tables;};
exports.tableColumns = tableColumns;
exports.dbRunSQL = dbRunSQL;