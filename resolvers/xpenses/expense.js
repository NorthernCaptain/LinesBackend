const userResolvers = require('./user').resolvers
const walletResolvers = require('./wallet').resolvers
const categoryResolvers = require('./category').resolvers

const queryResolvers = {
    expense: async (parent, {id}, {dataSources}) => {
        return dataSources.db.getExpense(id)
    },
    expenses: async (parent, {group_code, date_from, date_to, typ}, {dataSources}) => {
        return dataSources.db.getExpenses(group_code, date_from, date_to, typ)
    }
}

const objectResolvers = {
    Expense: {
        user: (parent, _, ctx) => userResolvers.queryResolvers.user(parent, {id: parent.user_id}, ctx),
        wallet: (parent, _, ctx) => walletResolvers.queryResolvers.wallet(parent, {id: parent.wallet_id}, ctx),
        category: (parent, _, ctx) => categoryResolvers.queryResolvers.category(parent, {id: parent.category_id}, ctx)
    }
}

exports.resolvers = {
    queryResolvers,
    objectResolvers
};