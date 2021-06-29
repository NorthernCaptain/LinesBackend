-- V2

use oldsdb;

--SELECT VERSION()

--  ROLES +++++++++++++++++++++++++++
-- DROP TABLE IF EXISTS roles;
CREATE TABLE IF NOT EXISTS oldsdb.roles (
ID INT NOT NULL PRIMARY KEY,
role VARCHAR(16) NOT NULL
);
COMMIT;

INSERT INTO oldsdb.roles (ID, role) VALUES (0, 'admin'),(9, 'power user'),(19, 'user'),(99, 'reader');
COMMIT;

SELECT * FROM roles;


--- WORKERS ++++++++++++++++++++++++
-- DROP TABLE IF EXISTS workers;
CREATE TABLE IF NOT EXISTS workers
(
ID INT NOT NULL AUTO_INCREMENT,
Email VARCHAR(128) NOT NULL ,
Name VARCHAR(64) NOT NULL,
Description VARCHAR(256) NULL,
UserID INT NULL,
Role INT DEFAULT 19,
CONSTRAINT workers_2_PK_id PRIMARY KEY (ID),
CONSTRAINT workers_2_UQ_email UNIQUE(email),
CONSTRAINT workers_2_FK_role FOREIGN KEY (Role) REFERENCES roles(ID) ON UPDATE RESTRICT ON DELETE RESTRICT

)
COLLATE 'utf8_general_ci';

ALTER TABLE oldsdb.workers
ADD t_rank int NOT NULL DEFAULT 0
ALTER TABLE oldsdb.workers
ADD g_rank int NOT NULL DEFAULT 0
ALTER TABLE oldsdb.workers
ADD sw_rank int NOT NULL DEFAULT 0


-- CONSTRAINT workers_2_CH_email CHECK (email RLIKE '^[A-Z0-9_][A-Z0-9._%+-]+@([A-Z0-9][A-Z0-9_]*\.){1,3}[A-Z]{1,5}$')
-- DOES NOT WORK in 5.7 -> need trigger


-- DROP TRIGGER IF EXISTS TRGworkerscheckemail;
DELIMITER $$

CREATE TRIGGER TRGworkerscheckemail
BEFORE INSERT ON workers
FOR EACH ROW
BEGIN
  IF (NEW.email NOT RLIKE '^[A-Z0-9_][A-Z0-9._%+-]+@([A-Z0-9][A-Z0-9_]*\.){1,3}[A-Z]{1,5}$')
  THEN
    SIGNAL SQLSTATE '02000' SET MESSAGE_TEXT = 'Warning: Wromg e-mail';
  END IF;
END$$

DELIMITER ;

COMMIT;
SHOW TRIGGERS;
------------------
-- ROLLBACK;

--
--DESCRIBE workers
--
--SELECT * FROM workers;
--SELECT * FROM WORKERS;
--SELECT * FROM JOBS;
--SELECT * FROM GEMS;
--SELECT * FROM GEM_LIST;
--SELECT * FROM TIMINGS;
--select * from authdb.users;
--SHOW TABLES

-- DELETE FROM workers WHERE id=70;


UPDATE workers
SET Role=0
WHERE ID=47;






--- GEM_LIST ++++++++++++++++++++++++

CREATE TABLE gem_list
(
ID int NOT NULL,
Code VARCHAR(16) NOT NULL,
Name VARCHAR(64) NOT NULL,

CONSTRAINT gem_list_PK_id Primary KEY (ID),
CONSTRAINT gem_list_UQ_name UNIQUE (Code)
)
COLLATE 'utf8_general_ci';

COMMIT;



--- JOBS ++++++++++++++++++++++++
-- DROP TABLE oldsdb.jobs;

CREATE TABLE oldsdb.jobs
(
    ID INT NOT NULL AUTO_INCREMENT,
    JobID VARCHAR(16) NOT NULL,
    WorkerID INT NOT NULL,
    Client VARCHAR(36),
    Color VARCHAR(32) DEFAULT 'Color Not Set',
    Description VARCHAR(128),
    StartDTS TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    EndDTS TIMESTAMP NULL DEFAULT NULL,
    DTS TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdateDTS TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
    JobStatus ENUM('Active', 'Finished', 'Waiting'),
    JobType ENUM('New', 'Continued'),

    CONSTRAINT jobs_2_PK_ID Primary KEY (ID),
    CONSTRAINT jobs_2_FK_workerID FOREIGN KEY (WorkerID) REFERENCES workers(ID)
)
COLLATE 'utf8_general_ci';

SELECT * FROM oldsdb.jobs;



-- ++++++++++++++++++++++++++++++++++++++++++++++++++++++


SHOW TABLES;

--- GEMS ++++++++++++++++++++++++
DESCRIBE GEMS

CREATE TABLE IF NOT EXISTS oldsdb.gems
(
    ID INT NOT NULL AUTO_INCREMENT,
    JobID INT NOT NULL,
    GemID INT NOT NULL,
    Cnt INT NOT NULL DEFAULT 0,
    Opt ENUM('ini', 'job', 'ret', 'msc') DEFAULT 'job',
    Dts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdateDts TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT gems_2_PK_ID PRIMARY KEY (ID),
    CONSTRAINT gems_2_FK_gemID FOREIGN KEY (GemID) REFERENCES gem_list (ID),
    CONSTRAINT gems_2_FK_jobID FOREIGN KEY (JobID) REFERENCES jobs (ID)
) COLLATE 'utf8_general_ci';





--   SELECT * FROM oldsdb.gems;



StartDTS TIMESTAMP NOT NULL DEFAULT '1980-01-01 00:00:00',
EndDTS TIMESTAMP NULL DEFAULT NULL,
DTS TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
UpdateDTS TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,

CONSTRAINT Timings_PK_JobID_WorkerID_StartDTS PRIMARY KEY (JobID, WorkerID, StartDTS),
CONSTRAINT Timings_FK_JobID FOREIGN KEY (JobID) REFERENCES JOBS(ID),
CONSTRAINT Timings_FK_WorkerID FOREIGN KEY (WorkerID) REFERENCES WORKERS(ID)
)
COLLATE 'utf8_general_ci';
--
--SELECT Email,Email RLIKE '^[A-Z0-9_][A-Z0-9._%+-]+@([A-Z0-9][A-Z0-9_]*\.){1,3}[A-Z]{1,5}$'
--FROM workers
--

-- TIMINGS ++++++++++++++++++++++++


SELECT * FROM TIMINGS;

-- DROP TABLE oldsdbtimings;
CREATE TABLE oldsdb.timings
(
JobID INT NOT NULL,
WorkerID INT NOT NULL,
StartDTS TIMESTAMP NOT NULL DEFAULT '1980-01-01 00:00:00',
EndDTS TIMESTAMP NULL DEFAULT NULL,
DTS TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
UpdateDTS TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,

CONSTRAINT timings_2_PK_JobID_WorkerID_StartDTS PRIMARY KEY (JobID, WorkerID, StartDTS),
CONSTRAINT timings_2_FK_JobID FOREIGN KEY (JobID) REFERENCES JOBS(ID),
CONSTRAINT timings_2_FK_WorkerID FOREIGN KEY (WorkerID) REFERENCES WORKERS(ID)
)
COLLATE 'utf8_general_ci';

COMMIT;




-- ++++++++++++++++++++++++++++++++++

DROP PROCEDURE IF EXISTS oldsdb.update_v2;

DELIMITER $$

CREATE PROCEDURE update_v2()
BEGIN
    INSERT INTO workers (ID,Name,Email,Description,userID,Role)
    SELECT w.id as ID,
        w.name as Name,
        SUBSTR(w.Description, 9, INSTR(w.Description, ',')-9) as Email,
        SUBSTR(w.Description, INSTR(w.Description, ',')+1) as Description,
        u.user_id as userID,
        19 as Role
    FROM WORKERS w
      LEFT JOIN authdb.users u
      ON SUBSTR(w.Description, 9, INSTR(w.Description, ',')-9)=u.email
    WHERE ID NOT IN (SELECT ID FROM oldsdb.workers);


    INSERT INTO oldsdb.gem_list
    SELECT * FROM GEM_LIST WHERE ID NOT IN (SELECT ID FROM oldsdb.gem_list);


    UPDATE jobs j
        JOIN JOBS J ON J.ID = j.ID
    SET j.JobType=J.jobType,
        j.jobStatus=J.jobStatus
    WHERE J.JobStatus <> j.jobStatus
        OR J.JobType <> j.jobType;


    INSERT INTO oldsdb.jobs
        (ID, JobID, WorkerID, Client, Color, Description,
        StartDts, EndDts, Dts, UpdateDTS,
        JobStatus, JobType)
    SELECT j.ID,
        j.JobID,
        j.WorkerID,
        j.Client,
        SUBSTR(j.Description, INSTR(j.Description, '[')+1, INSTR(j.Description, ']')-INSTR(j.Description, '[')-1) as Color,
        SUBSTR(j.Description, 1, INSTR(j.Description, '[')-1) as Description,
        StartDts,
        EndDts,
        StartDts as Dts,
        UpdateDTS,
        JobStatus,JobType
    FROM oldsdb.JOBS j
    WHERE j.ID NOT IN (SELECT ID FROM oldsdb.jobs);


    INSERT INTO oldsdb.gems (ID, JobID, GemID, Cnt, Opt, Dts, UpdateDTS)
    SELECT ID, JobID, GemID, Cnt, Opt, Dts, UpdateDTS
    FROM GEMS WHERE ID NOT IN (SELECT ID FROM oldsdb.gems);


    DELETE from oldsdb.timings;

    INSERT INTO oldsdb.timings
    SELECT T.* FROM TIMINGS T;


    DELETE FROM authdb.access_tokens
    WHERE expires_at < CURRENT_TIMESTAMP;

END $$



GRANT EXECUTE  ON procedure update_v2 TO 'gem_api'@'%';
----------------------------------------------------------------------

CALL oldsdb.update_v2();

------------------------
-- whois
DROP VIEW IF EXISTS oldsdb.whois;
CREATE VIEW oldsdb.whois
AS
    SELECT w.id,
        w.name,
        w.email,
        w.role,
        w.description,
        t.token
    FROM
        oldsdb.workers w
    JOIN
        oldsdb.roles r
        ON r.ID=w.role
    JOIN
        authdb.users u
        ON u.email = w.email
    JOIN
        authdb.access_tokens t
        ON t.user_id COLLATE utf8mb4_unicode_ci =u.user_id
    WHERE t.expires_at >= CURRENT_TIMESTAMP- INTERVAL 10 DAY;


--------------------------------------------------
-- users view
DROP VIEW IF EXISTS oldsdb.users;
CREATE VIEW oldsdb.users
AS
    SELECT id,
        name,
        email,
        role,
        description
    FROM
        oldsdb.whois
    GROUP BY id,
        name,
        email,
        role,
        description;

--------------------------------------------------------

-- WHO
SELECT id, name, email, role, description FROM oldsdb.whois
WHERE token = '6f1e4d13f15234b51695aa0edb319674b85545a7';


------------------------------------------
SELECT *
FROM
    (SELECT count(*) WORKERS from WORKERS) W,
    (SELECT count(*) workers from workers) w,
    (SELECT count(*) JOBS from JOBS) J,
    (SELECT count(*) jobs from jobs) j,
    (SELECT count(*) GEMS from GEMS) G,
    (SELECT count(*) gems from gems) g,
    (SELECT count(*) TIMINGS from TIMINGS) T,
    (SELECT count(*) timings from timings) t


DELETE FROM authdb.access_tokens
WHERE expires_at < CURRENT_TIMESTAMP

SELECT * FROM authdb.access_tokens


---   OVER
-- ROW_NUMBER like
SELECT
    id,
    name,
    email,
    role,
    description
FROM (
SELECT
    id,
    name,
    email,
    role,
    description,
    @rn:=IF(@user <> name, 1, @rn:=@rn+1) as rn,
    @user:=name as user
FROM
(
    SELECT
        w.id,
        w.name,
        w.email,
        w.role,
        w.description,
        t.token
    FROM
        oldsdb.workers w
    JOIN
        oldsdb.roles r
        ON r.ID=w.role
    JOIN
        authdb.users u
        ON u.email = w.email
    JOIN
        authdb.access_tokens t
        ON t.user_id=u.user_id

    WHERE t.expires_at >= CURRENT_TIMESTAMP- INTERVAL 2 DAY
    ORDER BY
        w.name,
        t.date_created DESC
) as X,
(SELECT @rn:=0, @user:=null) as r
) AS Z
WHERE rn<5;



-----------------------------------


SELECT
j.id, j.JobID, j.WorkerID, j.Client, j.Color, j.Description, j.StartDTS, j.EndDTS, j.JobStatus, j.JobType,
SUM(CASE WHEN g.id IS NOT NULL THEN 1 ELSE 0 END),
SUM(CASE WHEN t.jobid IS NOT NULL THEN 1 ELSE 0 END),
UNIX_TIMESTAMP(t.endDTS) - UNIX_TIMESTAMP(t.startDTS),
ROUND(SUM(UNIX_TIMESTAMP(t.endDTS) - UNIX_TIMESTAMP(t.startDTS))/3600,2) as hs
FROM jobs j
    left JOIN timings t ON t.jobid=j.id
    LEFT JOIN gems g ON g.jobid=j.id
WHERE j.workerID = 1
    AND
    j.id in (
    SELECT jobID FROM timings WHERE startDTS >= "2021-05-01"
    UNION
    SELECT jobID FROM gems WHERE DTS >= "2021-05-01"
    )
GROUP BY j.id, j.JobID, j.WorkerID, j.Client, j.Color, j.Description, j.StartDTS, j.EndDTS, j.JobStatus, j.JobType
,UNIX_TIMESTAMP(t.endDTS) - UNIX_TIMESTAMP(t.startDTS)




SELECT
j.id, j.JobID, j.WorkerID, j.Client, j.Color, j.Description, j.StartDTS, j.EndDTS, j.JobStatus, j.JobType,
t.startDTS,t.endDTS,
ROUND((UNIX_TIMESTAMP(t.endDTS) - UNIX_TIMESTAMP(t.startDTS))/3600,2) as hs
FROM jobs j
    left JOIN timings t ON t.jobid=j.id
WHERE j.workerID = 1
    AND
    j.id in (
    SELECT jobID FROM timings WHERE startDTS >= "2021-05-01"
    UNION
    SELECT jobID FROM gems WHERE DTS >= "2021-05-01"
    )
--GROUP BY j.id, j.JobID, j.WorkerID, j.Client, j.Color, j.Description, j.StartDTS, j.EndDTS, j.JobStatus, j.JobType







--UPDATE JOBS
--SET JobID='1013021',
--Client='Danell',
--Description='[black]',
--StartDTS='2021-05-18 5:00:48',
--UpdateDTS='2021-05-18 5:00:48',
--JobStatus='Finished'
--WHERE id=138


SELECT * FROM jobs
WHERE jobid RLIKE '2041020'


SELECT *
    ,ROUND((UNIX_TIMESTAMP(endDTS) - UNIX_TIMESTAMP(startDTS))/3600,2) as hs
    FROM TIMINGS
WHERE jobID='162'

SELECT
    startDTS,EndDTS,
    UNIX_TIMESTAMP(endDTS) - UNIX_TIMESTAMP(startDTS) as secs,
    ROUND((UNIX_TIMESTAMP(endDTS) - UNIX_TIMESTAMP(startDTS))/3600,2) as hs
FROM timings


select * from authdb.users;
select * from oldsdb.workers
INSERT INTO authdb.users
(email, name, password)
VALUES ('leonidtheking@gmail.com', 'Leo', '86709173364eb1d012e5e376858228753280a1b446acf1eba353c4a3f498d938')

INSERT INTO oldsdb.workers
(email, name, description, userid, role)
VALUES ('leonidtheking@gmail.com', 'Leo', '', 10, 9)


-- leanok - serafima
-- old11old - abyrvalg
-- leonidtheking - elcondor

--api.reader@navalclash.com
--_q1br4as2_
--a093f54f490e6def67177548bee60458597554743e8d22a04261d9c529af1287

--INSERT INTO authdb.users
--(email, name, password)
--VALUES ('api.reader@navalclash.com', 'Alex', '2faca8bc02caa9e13a04534bf5c74dcebf1227a7903c563b1f8bbfdea1a0f73e');
--INSERT INTO oldsdb.workers
--(email, name, description, userid, role)
--SELECT email, name, 'account with access to results',user_id, 99
--FROM  authdb.users
--WHERE email = 'api.reader@navalclash.com'


select * from timings t
join jobs j on j.id=t.jobid

ORDER BY t.jobid desc, t.startdts DESC LIMIT 30



CALL oldsdb.update_v2();


UPDATE oldsdb.TIMINGS
SET
ENDDTS='2021/06/03 10:35:45'
WHERE startDTS = '2021/06/03 10:17:50' and jobid=173

SELECT T.*, t.*
FROM TIMINGS T left JOIN
    timings t ON T.jobid = t.jobid and T.startdts = t.startdts
WHERE t.endDts <> T.endDts or t.enddts is null

select count(*) from TIMINGS
union ALL
select count(*) from timings

select * from JOBS
commit;

select * from workers
select * from WORKERS

    SELECT T.* FROM TIMINGS T WHERE jobid>174;
    SELECT T.* FROM timings T WHERE jobid=175;

DROP TABLE IF EXISTS oldsdb.payments;

CREATE TABLE oldsdb.payments
(
id TIMESTAMP NOT NULL PRIMARY KEY DEFAULT current_timestamp,
amount DECIMAL(7,2) NOT NULL DEFAULT 0.00,
start_date TIMESTAMP NULL DEFAULT NULL,
end_date TIMESTAMP NULL DEFAULT NULL,
userId INT NOT NULL,
createdDTS TIMESTAMP NOT NULL DEFAULT current_timestamp,
UpdateDts TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
)

INSERT INTO oldsdb.payments (id, amount, start_date, end_date, userId)
VALUES ('2021-05-17 23:59:59',  1996.83, '2021-05-01 00:00:00','2021-05-17 23:59:59.99', 11);
VALUES ('2021-05-31 23:59:59',  1432.96, '2021-05-18 00:00:00','2021-05-31 23:59:59.99', 11);

SELECT UNIX_TIMESTAMP(ID),
    amount,
    start_date,
    end_date
 FROM oldsdb.payments;

DROP TABLE IF EXISTS oldsdb.job_payments;
CREATE TABLE job_payments
(
id INT NOT NULL AUTO_INCREMENT,
jobID INT NULL,
paymentID TIMESTAMP NULL DEFAULT NULL,
amount DECIMAL(7,2) NOT NULL DEFAULT 0,
createdDTS TIMESTAMP NOT NULL DEFAULT current_timestamp,
UpdateDts TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

CONSTRAINT job_pauments_PK_id PRIMARY KEY (id),
CONSTRAINT job_payments_Fk_job_ID FOREIGN KEY (jobID) REFERENCES jobs(id),
CONSTRAINT job_payments_Fk_payments_ID FOREIGN KEY (paymentID) REFERENCES payments(id)
)

INSERT INTO job_payments (paymentID, jobID, amount)
VALUES ('2021-05-17 23:59:59', 158, 41.60),
('2021-05-17 23:59:59', 159, 363.25),
('2021-05-17 23:59:59', 160, 672.05),
('2021-05-17 23:59:59', 161, 21.12),
('2021-05-17 23:59:59', 162, 874.97),
('2021-05-17 23:59:59', 163, 23.68)


SELECT * FROM job_payments

select * from jobs
WHERE startDTS>=(SELECT start_date from payments where id='2021-05-17 23:59:59')
AND startDTS <= (SELECT end_date FROM payments where id='2021-05-17 23:59:59')

select * from payments

DROP VIEW IF EXISTS  oldsdb.jobs_p;
CREATE VIEW oldsdb.jobs_p
AS
SELECT
    j.id,
    j.jobID,
    workerID,
    client,
    color,
    description,
    startdts,
    endDTS,
    jobStatus,
    jobType,
    SUM(CASE WHEN jp.amount is NULL THEN 0.00 ELSE jp.amount END) AS job_amount
FROM jobs j LEFT JOIN
    job_payments jp ON j.id = jp.jobId
GROUP BY
    j.id,
    j.jobID,
    workerID,
    client,
    color,
    description,
    startdts,
    endDTS,
    jobStatus,
    jobType

select j.*
FROM jobs_p j
WHERE j.startDTS>=(SELECT start_date from payments where id='2021-05-17 23:59:59')
AND j.startDTS <= (SELECT end_date FROM payments where id='2021-05-17 23:59:59')

select * from JOBS
WHERE jobID='2038020'

SELECT * FROM TIMINGS
WHERE jobID=175
ORDER BY  STARTDTS DESC

-- Payments
SELECT
    j.ID,
    j.JobID,
    j.Client,
    j.Description,
    CASE WHEN j.color='Color Not set' THEN '' ELSE j.color END as color,
    j.JobStatus,
    j.JobType,
    jp.amount,
    p.id as pDTS,
    p.amount,
    p.start_date,
    p.end_date
FROM
    oldsdb.jobs j
    LEFT JOIN
    oldsdb.job_payments jp ON jp.jobid=j.id
    LEFT JOIN
    oldsdb.payments p ON jp.paymentid=p.id
WHERE
    j.startDTS>= "2021-05-01 0:00:00"

SELECT
    j.*,
    t.*
FROM
    oldsdb.jobs j
    JOIN



select t.jobID, t.WorkerID,
    sum(UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) - UNIX_TIMESTAMP(t.StartDTS)) as seconds,
    sum(UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) - UNIX_TIMESTAMP(t.StartDTS))/ 3600 as hours,
    CONCAT_WS(':',
        CONVERT (
            sum(UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) - UNIX_TIMESTAMP(t.StartDTS)) % 3600 DIV 60
            , CHAR
        ),
        LPAD(
            CONVERT (
                sum(UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) - UNIX_TIMESTAMP(t.StartDTS)) DIV 3600
                , CHAR
            ), 2, 0
        )
     )as time
 from timings t
 JOIN ranks r ON r.WorkerID = t.WorkerID AND r.type='time'
 GROUP BY t.jobID, t.WorkerID

-- RANKS
-- DROP TABLE oldsdb.ranks
CREATE TABLE oldsdb.ranks
(
ID INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
startDTS TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
WorkerID INT NOT NULL REFERENCES workers(id),
type VARCHAR(8) NOT NULL DEFAULT 'gem',
fk int NULL,
rank DECIMAL(6,2) NOT NULL,
createdDTS TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
updatedDTS TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)

-- EXPENSES
--DROP TABLE IF EXISTS oldsdb.expences;
CREATE TABLE expenses
(
id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
dts timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
description varchar(128) NOT NULL DEFAULT '',
cnt DECIMAL(7,2) NOT NULL DEFAULT 1.0,
price DECIMAL(8,2) NOT NULL DEFAULT 0.0,
jobId int NULL,
createdDTS timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
updatedDTS TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)

--INSERT INTO oldsdb.ranks(startDTS,WorkerID, type,fk,rank)
--SELECT '1999-01-01 0:00:00', 70,'gem',id,
--CASE WHEN name RLIKE '\Sewon.*' THEN 0.0 ELSE 7 END
--FROM oldsdb.gem_list
--UNION
--SELECT '1999-01-01 0:00:00',70,'time',NULL, 5.0

-- ranks_ranges
SELECT
    r1.n,
    r1.Id,
    r1.workerID,
    r1.type,
    r1.fk,
    r1.startDTS,
    CASE WHEN r2.endDts IS NULL THEN CURRENT_TIMESTAMP ELSE r2.endDTS END endDTS,
    r1.rank
FROM
(
SELECT id, startDTS,workerID,type,CASE WHEN fk is null then -1 ELSE fk END as fk,rank
    ,@n := IF(
        workerID=@cWorker  AND @cType=type AND @cFK=CASE WHEN fk is null then -1 ELSE fk END
        , @n+1, 1) as n
    ,@cWorker := workerID,
    @cType := type,
    @cFK := CASE WHEN fk is null then -1 ELSE fk END
FROM ranks
ORDER BY WORKERID, type,fk, startDTS DESC
) r1
LEFT JOIN
(
SELECT id, startDTS as EndDTS,workerID,type,CASE WHEN fk is null then -1 ELSE fk END as fk,rank
    ,@n := IF(
        workerID=@cWorker  AND @cType=type AND @cFK=CASE WHEN fk is null then -1 ELSE fk END
        , @n+1, 1) as n
    ,@cWorker := workerID,
    @cType := type,
    @cFK := CASE WHEN fk is null then -1 ELSE fk END
FROM ranks
ORDER BY WORKERID, type,fk, startDTS DESC
) r2
ON r1.WorkerID = r2.WorkerID
AND r1.type = r2.type
AND r1.fk = r2.fk
AND r1.n = r2.n+1

------------------------------------

SELECT
j.id, j.JobID, j.WorkerID, j.Client, j.Color, j.Description, j.StartDTS, j.EndDTS, j.JobStatus, j.JobType,
SUM(CASE WHEN g.id IS NOT NULL THEN 1 ELSE 0 END),
SUM(CASE WHEN t.jobid IS NOT NULL THEN 1 ELSE 0 END),
ROUND(SUM(UNIX_TIMESTAMP(t.endDTS) - UNIX_TIMESTAMP(t.startDTS))/3600,2) as hs
FROM jobs j
    left JOIN timings t ON t.jobid=j.id
    LEFT JOIN gems g ON g.jobid=j.id
WHERE j.WorkerID = 1
AND
 (t.jobid is not null and t.startDTS >= "2021-05-01"
OR
 g.jobID IS NOT NULL and g.DTS >= "2021-05-01" and g.opt='job')
GROUP BY j.id, j.JobID, j.WorkerID, j.Client, j.Color, j.Description, j.StartDTS, j.EndDTS, j.JobStatus, j.JobType


-- intervals with rank
SELECT
    t.jobID,
    t.startDTS,
    t.endDTS,
    r.type,
    r.rank,
    (UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) - UNIX_TIMESTAMP(t.StartDTS))  as secs,
    ROUND((UNIX_TIMESTAMP(t.endDTS) - UNIX_TIMESTAMP(t.startDTS))/3600,2) as hours,
    CONCAT(
        LPAD((UNIX_TIMESTAMP(t.endDTS) - UNIX_TIMESTAMP(t.startDTS)) DIV 3600 % 60,2, 0),
':',
    LPAD((UNIX_TIMESTAMP(t.endDTS) - UNIX_TIMESTAMP(t.startDTS)) % 3600 DIV 60, 2, 0),
':00'
) as time,
    (UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) - UNIX_TIMESTAMP(t.StartDTS)) DIV 3600  as hours,
    (UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) - UNIX_TIMESTAMP(t.StartDTS)) % 3600 DIV 60 as mins,
    TRUNCATE(
        ((UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) - UNIX_TIMESTAMP(t.StartDTS)) DIV 3600)*r.rank
+  +
    ((UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) - UNIX_TIMESTAMP(t.StartDTS)) % 3600 DIV 60)*(r.rank/60)
    , 2
) as usd
FROM timings t
JOIN
(
    SELECT
r1.n,
    r1.Id,
    r1.workerID,
    r1.type,
    r1.fk,
    r1.startDTS,
    CASE WHEN r2.endDts IS NULL THEN CURRENT_TIMESTAMP ELSE r2.endDTS END endDTS,
    r1.rank
FROM
(
    SELECT id, startDTS,workerID,type,CASE WHEN fk is null then -1 ELSE fk END as fk,rank
    ,@n := IF(workerID=@cWorker  AND @cType=type AND @cFK=CASE WHEN fk is null then -1 ELSE fk END
    , @n+1, 1) as n
    ,@cWorker := workerID,
@cType := type,
@cFK := CASE WHEN fk is null then -1 ELSE fk END
FROM ranks
ORDER BY WORKERID, type,fk, startDTS DESC
) r1
LEFT JOIN
(
    SELECT id,
    startDTS as EndDTS,
    workerID,
    type,
    CASE WHEN fk is null then -1 ELSE fk END as fk,
    rank,
    @n := IF(workerID=@cWorker  AND @cType=type AND @cFK=CASE WHEN fk is null then -1 ELSE fk END, @n+1, 1) as n,
    @cWorker := workerID,
    @cType := type,
    @cFK := CASE WHEN fk is null then -1 ELSE fk END
FROM ranks
ORDER BY WORKERID, type,fk, startDTS DESC
) r2
ON r1.WorkerID = r2.WorkerID
AND r1.type = r2.type
AND r1.fk = r2.fk
AND r1.n = r2.n+1
) r
ON r.WorkerId=t.WorkerID AND r.startDTS<= t.startDTS AND r.EndDTS>t.startDTS and -1=r.fk
WHERE t.startDTS>='2021-06-01 0:00:00'
AND t.startDTS<='2021-06-24 23:59:59,9999'
AND t.WorkerID=1
;


-- gems with ranks
SELECT
    jobID,
    gemID,
    code,
    name,
    SUM(gems) as cnt,
    SUM(amount) as amount
FROM
(
    SELECT
        j.id as jobID,
        g.gemID,
        l.code,
        l.name,
        SUM(-g.cnt)/10 as gems,
        SUM(-g.cnt*r.rank)/10 as amount
    FROM oldsdb.gems as g
        JOIN GEM_LIST l ON g.gemID=l.id
        JOIN jobs j ON j.id=g.jobID
    LEFT JOIN
    (
        SELECT
            r1.n,
            r1.Id,
            r1.workerID,
            r1.type,
            r1.fk,
            r1.startDTS,
            CASE WHEN r2.endDts IS NULL THEN CURRENT_TIMESTAMP ELSE r2.endDTS END endDTS,
            r1.rank
        FROM
        (
        SELECT id, startDTS,workerID,type,CASE WHEN fk is null then -1 ELSE fk END as fk,rank
            ,@n := IF(
                workerID=@cWorker  AND @cType=type AND @cFK=CASE WHEN fk is null then -1 ELSE fk END
                , @n+1, 1) as n
            ,@cWorker := workerID,
            @cType := type,
            @cFK := CASE WHEN fk is null then -1 ELSE fk END
        FROM ranks
        WHERE type='gem'
        ORDER BY WORKERID, type,fk, startDTS DESC
        ) r1
        LEFT JOIN
        (
        SELECT id, startDTS as EndDTS,workerID,type,CASE WHEN fk is null then -1 ELSE fk END as fk,rank
            ,@n := IF(
                workerID=@cWorker  AND @cType=type AND @cFK=CASE WHEN fk is null then -1 ELSE fk END
                , @n+1, 1) as n
            ,@cWorker := workerID,
            @cType := type,
            @cFK := CASE WHEN fk is null then -1 ELSE fk END
        FROM ranks
        WHERE type='gem'
        ORDER BY WORKERID, type,fk, startDTS DESC
        ) r2
        ON r1.WorkerID = r2.WorkerID
        AND r1.type = r2.type
        AND r1.fk = r2.fk
        AND r1.n = r2.n+1
    ) r
    ON r.workerId=j.workerID AND r.startDTS<= g.DTS AND r.EndDTS>g.DTS and g.gemid=r.fk
    WHERE g.opt='job'
        AND g.DTS>='2021-06-01 0:00:00'
        AND g.DTS<='2021-06-24 23:59:59,9999'
        AND j.WorkerID=1
    GROUP BY
        j.id,
        g.gemID
) gm
GROUP BY jobID, gemID, code, name
;



--- expenses
SELECT
    e.jobID,
    e.DTS,
    e.description,
    e.cnt,
    e.price,
    e.cnt*e.price as amount
FROM oldsdb.expenses e
JOIN oldsdb.jobs j
    ON e.jobID=j.ID
WHERE e.DTS>='2021-06-01 0:00:00'
        AND e.DTS<='2021-06-24 23:59:59,9999'
        AND j.WorkerID=1

--- payments


SELECT * FROM oldsdb.timings t
WHERE t.startDTS>='2021-06-01 0:00:00'
ORDER BY startDTS desc


select * from expenses


---v 8
EXPLAIN ANALYZE
WITH rn_ranks as
(
SELECT id,
    startDTS,
    startDTS as EndDTS,
    workerID,
    type,
    CASE WHEN fk is null then -1 ELSE fk END as fk,
    `rank`,
    ROW_NUMBER() OVER(PARTITION BY workerID, type ORDER BY startDTS DESC) as n
FROM oldsdb.ranks
WHERE workerId=1
),
r AS
(
SELECT
    r1.n,
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
AND r1.n = r2.n+1
),
intervals as
(
SELECT t.jobID,
    t.startDTS,
    t.endDTS,
    t.workerID,
    (UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) - UNIX_TIMESTAMP(t.StartDTS))  as secs,
    ROUND((UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) - UNIX_TIMESTAMP(t.startDTS))/60,0) as mins,
    ROUND(ROUND((UNIX_TIMESTAMP(CASE WHEN t.endDTS is NULL THEN t.startDTS ELSE t.endDTS END) - UNIX_TIMESTAMP(t.startDTS))/60,0)/60,2) as hours
    FROM timings t
    WHERE t.startDTS>='2021-06-01 0:00:00'
        AND t.startDTS<='2021-06-29 23:59:59,9999'
        AND t.WorkerID=1
)
SELECT
    t.jobID,
    t.startDTS,
    t.endDTS,
    r.type,
    r.rank,
    t.secs  as secs,
    t.mins,
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

-- gems
WITH rn_ranks as
(
SELECT id,
    startDTS,
    startDTS as EndDTS,
    workerID,
    type,
    CASE WHEN fk is null then -1 ELSE fk END as fk,
    ranks.rank,
    ROW_NUMBER() OVER(PARTITION BY workerID, CASE WHEN fk is null then -1 ELSE fk END, type ORDER BY startDTS DESC) as n
FROM oldsdb.ranks
WHERE workerId=1 AND type='gem'
),
r AS (
SELECT
    r1.n,
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
        AND r1.n = r2.n+1
)
SELECT
    j.id as jobID,
    g.gemID,
    l.code,
    l.name,
    SUM(-g.cnt)/10 as gems,
    SUM(-g.cnt*r.rank)/10 as amount
FROM oldsdb.gems as g
    JOIN oldsdb.gem_list l ON g.gemID=l.id
    JOIN oldsdb.jobs j ON j.id=g.jobID
    JOIN r
    ON r.workerId=j.workerID AND r.startDTS<= g.DTS AND r.EndDTS>g.DTS and g.gemid=r.fk
WHERE j.workerID=1 AND g.opt='job' AND g.DTS BETWEEN '2021-06-01 0:00:00' AND '2021-06-30 0:00:00'
GROUP BY j.ID, g.gemID, l.code, l.name


ORDER BY  j.ID, g.gemID
