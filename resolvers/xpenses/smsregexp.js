const userResolvers = require('./user').resolvers;
const walletResolvers = require('./wallet').resolvers;

const queryResolvers = {
    smsregexp: async (parent, {id}, {dataSources, smsregexpCache}) => {
        return smsregexpCache.cached("id", id, async () => dataSources.db.getSmsRegExp(id))
    },
    smsregexps: async (_, {user_id}, {dataSources}) => dataSources.db.getSmsRegExps(user_id)
}

const objectResolvers = {
    SmsRegExp: {
        user: async (parent, _, ctx) => userResolvers.queryResolvers.user(parent, {id: parent.user_id}, ctx),
        wallet: async (parent, _, ctx) => walletResolvers.queryResolvers.wallet(parent, {id: parent.wallet_id}, ctx)
    }
}

exports.resolvers = {
    queryResolvers,
    objectResolvers
}
