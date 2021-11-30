const  db = require('./db').expensesdb;
const  knex = require('./db').expensesknex;
const graphql = require('graphql');
const { SQLDataSource } = require("datasource-sql");

class ExpensesDatabase extends SQLDataSource {
    async getUser(id) {
        return this.knex.select().from("users").where("id", id).first().cache();
    }

    async getUserByToken(token) {
        return this.knex.select().from("users")
            .join("authdb.access_tokens", "authdb.access_tokens.user_id", "=", "users.auth_user_id")
            .where("authdb.access_tokens.token", token).first().cache();
    }

    async getWallet(id) {
        return this.knex.select().from("wallet").where("id", id).first().cache();
    }

    async getCategory(id) {
        return id ? this.knex.select().from("ecategory").where("id", id).first().cache() : null;
    }

    async getCategories(ids) {
        return this.knex.select().from("ecategory").whereIn("id", ids).orderBy("id").cache();
    }

    async getCategoriesByParent(id) {
        return id ? this.knex.select().from("ecategory").where("parent_id", id).cache() : [];
    }

    async getCategories(group_code, typ) {
        let query = this.knex.select().from("ecategory")
            .where("group_code", group_code)
            .andWhere("state", 1);
        if(typ) query = query.andWhere("typ", typ);
        return query.orderBy(["name", "id"]).cache();
    }

    async getSmsRegExps(user_id) {
        let query = this.knex.select().from("smsregexp");
        if(user_id) {
            query = query.where("user_id", user_id);
        }
        return query.cache();
    }

    async getSmsRegExp(id) {
        return id ? this.knex.select().from("smsregexp").where("id", id).first().cache() : null;
    }

    async getExpense(id) {
        return id ? this.knex.select().from("expenses").where("id", id).first().cache() : null;
    }

    async getExpenses(group_code, date_from, date_to, typ) {
        if(!group_code || !date_from || !date_to) return []
        let query =
            this.knex.select().from("expenses")
                .where("group_code", group_code)
                .andWhere("tran_date", ">=", date_from)
                .andWhere("tran_date", "<=", date_to);
        if(typ) query = query.andWhere("typ", typ);
        return query.orderBy(["tran_date", "id"]).cache();
    }

}

exports.apolloDB = new ExpensesDatabase(knex);

const {
    GraphQLScalarType,
} = graphql;

async function getDataGQL(gtype, whereValues, asList = true) {
    return new Promise((resolve => {
        let fields = fieldsListGQL(gtype);
        let where = whereListGQL(whereValues);
        let table = tableName(gtype);
        let sql = `SELECT ${fields.join(',')} FROM ${table} WHERE ${where.where.join(' AND ')}`
        console.log("GQL2DB: ", sql);
        db.query(sql, where.vals, (error, result) => {
                if(error) console.log("ERROR GQL2DB: ", error, sql);
                resolve(asList ? result : (result && result.length ? result[0] : null))
            })
    }))
}

function tableName(gtype) {
    let nfo = gtype.description ? JSON.parse(gtype.description) : null;
    return nfo && nfo.table ? nfo.table : gtype.name.toLowerCase();
}

function fieldsListGQL(gtype) {
    let fnames = [];
    let fields = gtype._fields;
    for(let fname in fields) {
        let field = fields[fname];
        if(field.type instanceof GraphQLScalarType) {
            fnames.push(fname);
        }
    }
    return fnames;
}

function whereListGQL(values) {
    let where = [];
    let vals = [];
    for(let name in values) {
        let val = values[name];
        let op = val != null ? '=' : ' is '
        where.push(`${name}${op}?`);
        vals.push(val);
    }
    return {where, vals};
}

exports.getDataGQL = getDataGQL;