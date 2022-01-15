const { respond } = require('../utils/respond')
const { apolloDB } = require('../db/expenses')
const { validate } = require("../utils/validate");
const  knex = require('../db/db').expensesknex;

const userInfoByToken = async (req, res) => {
    let body = req.body;
    console.log("User INFO request with", body);
    validate(body, "user_info_by_token_req");

    let uinfo = await apolloDB.getUserByToken(body.token);

    let resp = {
        type: "usr",
        id: uinfo.id,
        si: uinfo.sync_id,
        nm: uinfo.short_name,
        st: uinfo.state,
        grp: uinfo.group_code,
        di: uinfo.device_id
    }
    console.log("User INFO response with", resp);
    respond(resp,"user_info_by_token_resp", res);
};

let request = {
    "type": "sync",
    "si": 1,
    "unm": "Leo",
    "grp": 0,
    "gpin": "1234",
    "lsid": 0,
    "gcm": "",
    "ar": [{
        "id": 1,
        "ot": "C",
        "oa": "I",
        "o": {"id": 1, "si": 0, "nm": "Продукты", "so": 0, "st": 1, "tp": -1, "psi": 0}
    }, {
        "id": 2,
        "ot": "C",
        "oa": "I",
        "o": {"id": 2, "si": 0, "nm": "Хоз. товары", "so": 0, "st": 1, "tp": -1, "psi": 0}
    }, {
        "id": 3,
        "ot": "C",
        "oa": "I",
        "o": {"id": 3, "si": 0, "nm": "Транспорт", "so": 0, "st": 1, "tp": -1, "psi": 0}
    }, {
        "id": 4,
        "ot": "C",
        "oa": "I",
        "o": {"id": 4, "si": 0, "nm": "Еда вне дома", "so": 0, "st": 1, "tp": -1, "psi": 0}
    }, {
        "id": 5,
        "ot": "C",
        "oa": "I",
        "o": {"id": 5, "si": 0, "nm": "Крупные покупки", "so": 0, "st": 1, "tp": -1, "psi": 0}
    }, {
        "id": 6,
        "ot": "W",
        "oa": "I",
        "o": {"id": 1, "si": 0, "nm": "Cash", "sn": "Cash", "so": 0, "st": 1, "am": 0, "ad": 1641779077156}
    }, {
        "id": 7,
        "ot": "W",
        "oa": "I",
        "o": {"id": 2, "si": 0, "nm": "Card", "sn": "Card", "so": 0, "st": 1, "am": 0, "ad": 1641779077157}
    }, {
        "id": 8,
        "ot": "E",
        "oa": "I",
        "o": {
            "id": 1,
            "si": 0,
            "de": "Description test",
            "am": 2230,
            "td": 1641953530908,
            "ca": 0,
            "wa": 0,
            "us": 1,
            "st": 1,
            "tp": -1
        }
    }, {
        "id": 9,
        "ot": "E",
        "oa": "U",
        "o": {
            "id": 1,
            "si": 0,
            "de": "Description test",
            "am": 2230,
            "td": 1641953530908,
            "ca": 0,
            "wa": 0,
            "us": 1,
            "st": 1,
            "tp": -1
        }
    }, {
        "id": 10,
        "ot": "C",
        "oa": "I",
        "o": {"id": 6, "si": 0, "nm": "Fast food", "so": 0, "st": 1, "tp": -1, "psi": -1}
    }, {
        "id": 11,
        "ot": "E",
        "oa": "I",
        "o": {
            "id": 2,
            "si": 0,
            "de": "Chick FilA",
            "am": 1211,
            "td": 1642275963166,
            "ca": 0,
            "wa": 0,
            "us": 1,
            "st": 1,
            "tp": -1
        }
    }, {
        "id": 12,
        "ot": "E",
        "oa": "U",
        "o": {
            "id": 2,
            "si": 0,
            "de": "Chick FilA",
            "am": 1211,
            "td": 1642275963166,
            "ca": 0,
            "wa": 0,
            "us": 1,
            "st": 1,
            "tp": -1
        }
    }]
}

class SyncObject
{
    constructor(ctx, json) {
        this.tableName = "sync_objects";
        this.dbFields = { owner_id: "ownerId", owner_rec_id: "ownerRecId"}
        this.ownerId = ctx.ownerId;
        this.ownerRecId = 0;
        if(json) this.deserialize(json);
    }

    deserialize(json) {
        this.ownerRecId = json.id;
    }

    async selectByOwnerId() {
        return knex.select().from(this.tableName)
            .where("owner_id", this.ownerId)
            .andWhere("owner_rec_id", this.ownerRecId)
            .first();
    }
}

class Category extends SyncObject
{
    constructor(ctx, json) {
        super(ctx, json);
        this.tableName = "ecategory";
    }
}

class Wallet extends SyncObject
{
    constructor(ctx, json) {
        super(ctx, json);
    }
}

class Expense extends SyncObject
{
    constructor(ctx, json) {
        super(ctx, json);
    }
}

class TranLog extends SyncObject
{
    constructor(ctx, json) {
        super(ctx, json);
    }

    deserialize(json) {
        super.deserialize(json);
        this.dbAction = json.oa;
        this.objType = json.ot;
        this.obj = this.createObject();
        this.obj.deserialize(json.o);
    }

    createObject() {
        switch(this.objType) {
            case "C":
                return new Category(this.ctx);
            case "W":
                return new Wallet(this.ctx);
            case "E":
                return new Expense(this.ctx);
            default:
                return null;
        }
    }
}

const processSync = async (req, res) => {
    let body = req.body;
    console.log("Sync request with", body, JSON.stringify(body));
//    validate(body, "user_info_by_token_req");

    let ctx = {
        ownerId: body.si,
        groupCode: body.gpin,
        lastSyncId: body.lsid,
        db: knex
    }

    for(let entry of body.ar) {
        console.log("Processing entry", entry.o);
    }

    let resp = {
        type: "synctst",
        id: 0,
        si: 0,
        nm: "",
        st: 1,
        grp: 0,
        di: 0
    }
    console.log("User INFO response with", resp);
    respond(resp,"user_info_by_token_resp", res);
};

exports.userInfoByToken = userInfoByToken;
exports.processSync = processSync;