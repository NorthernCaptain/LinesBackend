const mysql = require('mysql');

const db = mysql.createPool({
    connectionLimit: 10,
    host: process.env[`db_host`],
    database: process.env[`db_database`],
    user: process.env[`db_user`],
    password: process.env[`db_password`],
    timezone: 'Z'
});

const oldsdb = mysql.createPool({
    connectionLimit: 10,
    host: process.env[`db_host`],
    database: process.env[`db_olds_database`],
    user: process.env[`db_olds_user`],
    password: process.env[`db_olds_password`],
    timezone: 'Z'
});


const authdb = mysql.createPool({
    connectionLimit: 10,
    host: process.env[`db_host`],
    database: process.env[`db_auth_database`],
    user: process.env[`db_auth_user`],
    password: process.env[`db_auth_password`],
    timezone: 'Z'
});



exports.linesdb = db;
exports.oldsdb = oldsdb;
exports.authdb = authdb;