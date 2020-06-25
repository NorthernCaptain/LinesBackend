-- DROP SCHEMA IF EXISTS oldsdb;
CREATE SCHEMA IF NOT EXISTS oldsdb;

use oldsdb;
show variables where Variable_name='lower_case_table_names';
--/etc/mysql/my.cnf
--[musql]
--lower_case_table_names=1

---------------------------------------
DROP USER IF EXISTS gem_api;
CREATE USER gem_api IDENTIFIED BY '_abyrvalg_';
SELECT * FROM mysql.user;

GRANT SELECT, INSERT, UPDATE ON oldsdb.* TO 'gem_api'@'%';


--------------------------------------
DROP TABLE IF EXISTS WORKERS;

CREATE TABLE IF NOT EXISTS WORKERS
(
ID INT NOT NULL AUTO_INCREMENT,
Name VARCHAR(64) NOT NULL,
Description VARCHAR(256) NULL,
CONSTRAINT Workers_PK_ID PRIMARY KEY (ID)
)
COLLATE 'utf8_general_ci';

INSERT INTO WORKERS (Name, Description) VALUES ('Serafima', 'lenok@gmail.com');
COMMIT;
SELECT * FROM WORKERS;

---------

CREATE TABLE IF NOT EXISTS JOBS
(
ID INT NOT NULL AUTO_INCREMENT,
JobID varchar(24),
WorkerID INT NOT NULL,
Client varchar(128),
Description varchar(256),
StartDTS TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
EndDTS TIMESTAMP NULL DEFAULT NULL,
UpdateDTS TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
JobStatus ENUM('Active', 'Finished', 'Waiting'),
JobType ENUM('New', 'Continued'),

CONSTRAINT Jobs_PK_ID PRIMARY KEY (ID),
CONSTRAINT Jobs_FK_Workesrs_ID FOREIGN KEY (WorkerID)
           REFERENCES WORKERS(ID)
)
COLLATE 'utf8_general_ci';

INSERT INTO JOBS (JobID, WorkerID, Client, Description, StartDTS, EndDTS, JobStatus, JobType)
VALUES('2082017', 1, '', '', TIMESTAMP('2020-06-10'), TIMESTAMP('2020-06-12'),
'Finished', 'New')

SELECT * FROM JOBS;
COMMIT;

--    SELECT CURRENT_TIMESTAMP, TIMESTAMP('2020-06-10'), TIMESTAMP('2020-06-10 1:00:00'),
--    TIMESTAMP(CURDATE()), LOCALTIMESTAMP();
-----------
--  DROP TABLE GEM_LIST;
CREATE TABLE GEM_LIST
(
ID INT NOT NULL AUTO_INCREMENT,
Code VARCHAR(128),
Name VARCHAR(128) NOT NULL,

CONSTRAINT Gems_PK_ID PRIMARY KEY (ID),
CONSTRAINT Gem_List_Code_UQ UNIQUE (Code)
)
COLLATE 'utf8_general_ci';

INSERT INTO GEM_LIST
(Code, Name) VALUES('SWA','Swarowsky'),('PRES', 'Presiosa'), ('AC', 'Austryan Cristall'),
('CH', 'Chinese'), ('Sewon SWA','Sewon Swarowsky'), ('Sewon CH','Sewon Chinese')
;
INSERT INTO GEM_LIST
(Code, Name) VALUES('MB','Magic Box')
;

SELECT * FROM GEM_LIST;
COMMIT;

-----------------------
-- DROP TABLE GEMS;
CREATE TABLE GEMS
(
ID INT NOT NULL AUTO_INCREMENT,
JobID INT NOT NULL,
GemID INT NOT NULL,
Cnt DECIMAL(4,1),
Dts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
UpdateDts TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,


CONSTRAINT Gems_PK_ID PRIMARY KEY (ID),
CONSTRAINT Gems_FK_JobID FOREIGN KEY (JobID) REFERENCES JOBS(ID),
CONSTRAINT Gems_FK_GemID FOREIGN KEY (GemID) REFERENCES GEM_LIST(ID)
)
COLLATE 'utf8_general_ci';

INSERT INTO oldsdb.GEMS (JobID, GemID, Cnt)
VALUES(1,1,10);
COMMIT;

SELECT * FROM GEMS;

--------------------------
-- DROP TABLE oldsdb.TIMINGS;
CREATE TABLE oldsdb.TIMINGS
(
JobID INT NOT NULL,
WorkerID INT NOT NULL,
StartDTS TIMESTAMP NOT NULL DEFAULT '1980-01-01 00:00:00',
EndDTS TIMESTAMP NULL DEFAULT NULL,
DTS TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
UpdateDTS TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,

CONSTRAINT Timings_PK_JobID_WorkerID_StartDTS PRIMARY KEY (JobID, WorkerID, StartDTS),
CONSTRAINT Timings_FK_JobID FOREIGN KEY (JobID) REFERENCES JOBS(ID),
CONSTRAINT Timings_FK_WorkerID FOREIGN KEY (WorkerID) REFERENCES WORKERS(ID)
)
COLLATE 'utf8_general_ci';

INSERT INTO oldsdb.TIMINGS(jobID, workerID, startDTS, endDTS)
VALUES(1,1,TIMESTAMP('2020-06-10 15:10:00'), TIMESTAMP('2020-06-10 18:23:00'))

SELECT * FROM TIMINGS;

-----------------------------
--
-----------------------------
SHOW TABLES;

SELECT * FROM WORKERS;
SELECT * FROM GEM_LIST;

select* FROM mysql.`user`;

SELECT *
FROM information_schema.TABLES
WHERE TABLE_NAME IN (
    SELECT TABLE_NAME
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'oldsdb'
);

SELECT * FROM information_schema.INNODB_SYS_TABLES WHERE name like 'lines%';
SELECT * FROM information_schema.COLUMNS WHERE Table_schema = 'linesdb' AND table_name like 'game%';
select * from information_schema.USER_PRIVILEGES;
select * from information_schema.TABLE_PRIVILEGES;

SHOW schemas;

SHOW GRANTS FOR 'gem_api';
GRANT USAGE ON oldsdb.* TO 'gem_api';
GRANT SELECT, INSERT, UPDATE ON oldsdb.* TO 'gem_api'@'%';
GRANT SELECT, INSERT, UPDATE ON oldsdb.* TO 'gem_api'@'localhost';

REVOKE ALL ON oldsdb.* FROM 'gem_api';


--UPDATE TIMINGS
--SET enddts = '2022-06-24 15:10:24'
--WHERE jobid = 1 AND workerid = 1 AND startdts = '2020-06-24 19:12:09';

