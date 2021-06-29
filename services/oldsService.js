const {ServerError, ClientError} = require('../errors');
const {validate} = require('../utils/validate.js');
const {respond} = require('../utils/respond.js');
const {dbRunSQL, tableColumns, getTables} = require('../db/oldsdb');

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

const sqlTime = (workerId, start, end) => `
    SELECT
        jobID,
        secs,
        hours,
        time
    FROM (
    SELECT
        t.jobID,
        SUM(UNIX_TIMESTAMP(t.endDTS) - UNIX_TIMESTAMP(t.startDTS)) as secs,
        ROUND(SUM(UNIX_TIMESTAMP(t.endDTS) - UNIX_TIMESTAMP(t.startDTS))/3600,2) as hours,
            CONCAT(
                LPAD(SUM(UNIX_TIMESTAMP(t.endDTS) - UNIX_TIMESTAMP(t.startDTS)) DIV 3600 % 60,2, 0),
                ':',
                LPAD(SUM(UNIX_TIMESTAMP(t.endDTS) - UNIX_TIMESTAMP(t.startDTS)) % 3600 DIV 60, 2, 0),
                ':00'
                ) as time
    FROM TIMINGS t
        JOIN JOBS j
        ON t.jobID=j.id
    WHERE t.workerID=${workerId} AND t.startDTS>='${start}' AND t.startDTS<='${end}'
    GROUP BY t.jobID
    ) as x ;
`;

const sqlGems = (workerId, start, end) => `
WITH rn_ranks as
(
 SELECT id,
        startDTS,
        startDTS  as EndDTS,
        workerID,
        type,
        CASE WHEN fk is null then -1 ELSE fk END as fk,
        ranks.rank,
        ROW_NUMBER() OVER(PARTITION BY workerID, CASE WHEN fk is null then -1 ELSE fk END, type ORDER BY startDTS DESC) as n
 FROM oldsdb.ranks
 WHERE workerId = ${workerId}
   AND type = 'gem'
),
r AS (
SELECT r1.n,
    r1.Id,
    r1.workerID,
    r1.type,
    r1.fk,
    r1.startDTS,
    CASE WHEN r2.endDts IS NULL THEN CURRENT_TIMESTAMP ELSE r2.endDTS END endDTS,
    r1.rank
FROM rn_ranks r1
      LEFT JOIN rn_ranks r2
                ON r1.WorkerID = r2.WorkerID
                    AND r1.type = r2.type
                    AND r1.fk = r2.fk
                    AND r1.n = r2.n + 1
)
SELECT j.id as jobID,
    g.gemID,
    l.code,
    l.name,
    SUM(-g.cnt) / 10          as gems,
    SUM(-g.cnt * r.rank) / 10 as amount
FROM oldsdb.gems as g
    JOIN oldsdb.gem_list l ON g.gemID = l.id
    JOIN oldsdb.jobs j ON j.id = g.jobID
    JOIN r
      ON r.workerId = j.workerID AND r.startDTS <= g.DTS AND r.EndDTS > g.DTS and g.gemid = r.fk
WHERE j.workerID = ${workerId}
    AND g.opt = 'job'
    AND g.DTS BETWEEN '${start}' AND '${end}'
    GROUP BY j.ID, g.gemID, l.code, l.name
`;


const sqlIntervals = (workerId, start, end) => `
WITH rn_ranks as
(
    SELECT id,
        startDTS,
        startDTS as EndDTS,
        workerID,
        type,
        CASE WHEN fk is null then -1 ELSE fk END as fk,
        ranks.rank,
        ROW_NUMBER() OVER(PARTITION BY workerID, type ORDER BY startDTS DESC) as n
    FROM oldsdb.ranks
    WHERE workerId = ${workerId}
),
r AS
(
    SELECT r1.n,
        r1.Id,
        r1.workerID,
        r1.type,
        r1.fk,
        r1.startDTS,
        CASE WHEN r2.endDts IS NULL THEN CURRENT_TIMESTAMP ELSE r2.endDTS END endDTS,
        r1.rank
    FROM rn_ranks r1
          LEFT JOIN rn_ranks r2
                    ON r1.WorkerID = r2.WorkerID
                        AND r1.type = r2.type
                        AND r1.fk = r2.fk
                        AND r1.n = r2.n + 1
),
intervals as
(
    SELECT t.jobID,
        t.startDTS,
        t.endDTS,
        t.workerID,
        (UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) -
         UNIX_TIMESTAMP(t.StartDTS))                               as secs,
        ROUND((UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) -
               UNIX_TIMESTAMP(t.startDTS)) / 60, 0)                as mins,
        ROUND(ROUND((UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) -
                     UNIX_TIMESTAMP(t.startDTS)) / 60, 0) / 60, 2) as hours
    FROM timings t
    WHERE t.workerID=${workerId} AND t.startDTS>='${start}' AND t.startDTS<='${end}'
)
SELECT t.jobID,
       t.startDTS,
       t.endDTS,
       r.type,
       r.rank,
       t.secs  as secs,
       t.hours as hours,
       CONCAT(
               LPAD(t.mins DIV 60,2, 0),':',
               LPAD(t.mins % 60, 2, 0),':00'
           ) as time,
      TRUNCATE(t.hours*r.rank, 2) as usd
FROM intervals t
    JOIN r
ON r.WorkerId=t.WorkerID AND r.startDTS<= t.startDTS AND r.EndDTS>t.startDTS and -1=r.fk
;
`;

const sqlIds = (ids) => `
    SELECT id,
        CASE WHEN JobID RLIKE 'D4D' THEN CONCAT('Misc job ', REPLACE(jobID, 'D4D_', '')) ELSE JobID END as jobID,
        Client,
        UNIX_TIMESTAMP(StartDTS) as startDTS,
        UNIX_TIMESTAMP(IFNULL(EndDTS, UpdateDTS)) as endDTS,
        JobStatus as Status,
        JobType as Type
        , SUBSTR(Description, 1, INSTR(Description, '[')-2) as Discription
        , SUBSTR(Description, INSTR(Description, '[')+1, INSTR(Description, ']') - INSTR(Description, '[') - 1) as Color
    FROM oldsdb.JOBS where id IN (${ids})
`;


const getResults = async (req, res) => {
//    const regx = new RegExp("(?<=Bearer )[a-fA-F0-9]+")
//    const token = regx.exec(req.get("Authorization"))[0]

    const workerId = req.params.workerId;
    var start = req.query.start;
    var end = req.query.end;
    if ( typeof start === 'undefined' || typeof end === 'undefined' ) {
        throw new ClientError('Missing params');
        }
    start += ' 00:00:00';
    end += ' 23:59:59';
    var timings = [];
    var intervals = [];
    var gems = [];
    var jobs = [];
    try {
        timings = await dbRunSQL(sqlTime(workerId, start, end));
        // console.log(sqlIntervals(workerId, start, end));
        intervals = await dbRunSQL(sqlIntervals(workerId, start, end));
        var ids = timings.map(x => x.jobID);
        gems = await dbRunSQL(sqlGems(workerId, start, end));
        ids = [...new Set(ids.concat(gems.map(x => x.jobID)))]
        if (ids.length === 0){
            respond([], 'skip', res);
            return;
            }
        jobs = await dbRunSQL(sqlIds(ids.join()));
        }
    catch (ex) {
        throw new ServerError(ex, [workerId, start, end]);
        }

    jobs.forEach(job => {
        job.gems = gems.filter(time => time.jobID === job.id).map(({jobID, ...rest}) => rest);
        const tt = timings.filter(time => time.jobID === job.id).map(({jobID, ...rest}) => rest);
        job.times = tt.length === 0? {'secs': 0, 'hours': 0.0, 'time': '00:00:00'}: tt[0]
        job.intervals = intervals.filter(interval => interval.jobID === job.id).map(({jobID, ...rest}) => rest);
        })
    respond(jobs, 'skip', res);

};


const getRecords = async (req, res) => {

    await dbRunSQL("CALL oldsdb.update_v2();");
    const table = req.params.tbl.toLowerCase();
    const tables = getTables();
    const table_name = tables[table].name;
    if ( !table_name ) {
        throw new ServerError('Oooops!!!');
    }
    const query = req.query;
    console.log(`\nNew GET - ${table}`)
    validate({...query,...{[table_name]: true}}, req_schema);

    var where = [];
    var params = [];
    const dt = table === "gems" ? "DTS": "StartDTS";

    for ( var key in query ) {
        switch (key){
            case "start":
                where.push(`${dt} >= ?`);
                params.push(query[key] + ' 00:00:00');
                break;
            case "end":
                where.push(`${dt} <= ?`);
                params.push(query[key] + ' 23:59:59');
                break;
            default:
                where.push(`${key} = ?`);
                params.push(query[key]);
        }
    }
//    console.log(JSON.stringify(params));
    const limit_ = where.length == 0 ? 'LIMIT 100' : ''
    where = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''
    const sql = `SELECT ${tableColumns(table)} FROM ${table_name} ${where} ${limit_};`
    var data = [];
    try {
        data = await dbRunSQL(sql, params);
        }
    catch (ex) {
        throw new ServerError(ex, values);
        }
    if (data.length === 0) {
        data.push(null);
    }

    respond(data, resp_schema, res);
    console.log(`  Success: ${data.length}`)
//    for (var row of data) console.log(JSON.stringify(row));
};

const newRecords = async (req, res) => {
    let data = req.body;
    let table = req.params.tbl ? req.params.tbl.toLowerCase() : "notable";
    console.log(`New POST request - ${table}\n    ${JSON.stringify(data)}`);
    let table_name;
    let tables = getTables();
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
        let sql = `INSERT INTO
            ${table_name}(${column_list})
            VALUES(${Array(columns.length).fill('?').join(',')});`
        let id = null;
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
        let sql = `SELECT ${tableColumns(table)}
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
    let tables = getTables();

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
    for(let rownumber in data){
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
        let sql = `UPDATE ${table_name}
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



// V2

const who = async (req) => {
    const regx = new RegExp("(?<=Bearer )[a-fA-F0-9]+")
    const token = regx.exec(req.get("Authorization"));

    if ( !token || typeof token[0] === 'undefined') {
        return {};
        }
    const sql = `SELECT id, name, email, role, description FROM oldsdb.whois WHERE token = '${token[0]}';`
    const user = await dbRunSQL(sql);
    return user[0];
    }

const getLoggedUser = async (req, res) => {
    try {
        const user = await who(req);
        respond(user, 'skip', res);
        }
    catch (ex) {
        throw new ServerError(ex, [token]);
        }
};

const getUsers = async (req, res) => {
    const user = await who(req);

    if ( user.role === undefined || user.role > 10) {
        req.query.id = user.id.toString();
        }
    req.params.tbl = "users";
    await getRecords(req, res);
};


exports.newRecords = newRecords;
exports.updateRecord = updateRecord;
exports.getRecords = getRecords;
exports.getResults = getResults;
exports.getLoggedUser = getLoggedUser;
exports.getUsers = getUsers;
