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


    INSERT INTO oldsdb.timings
    SELECT T.* FROM TIMINGS T
    LEFT JOIN oldsdb.timings t2
    ON T.JobID=t2.JobID
        AND T.WorkerID=t2.WorkerID
        AND T.StartDTS=t2.StartDTS
    WHERE t2.JobID IS NULL;

END $$



GRANT EXECUTE  ON procedure update_v2 TO 'gem_api'@'%';
----------------------------------------------------------------------

CALL oldsdb.update_v2();

------------------------
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
        ON t.user_id=u.user_id
    WHERE t.expires_at >= CURRENT_TIMESTAMP- INTERVAL 10 DAY;


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
SELECT id, name, email, role, description FROM oldsdb.users
WHERE token = '1b3934910b58124de96a1e2667641735d3413cae';


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

