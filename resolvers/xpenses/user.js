
const queryResolvers = {
    user: async (parent, {id}, {dataSources, userCache}) => {
        return userCache.cached("id", id, async () => dataSources.db.getUser(id))
    }
}

const objectResolvers = {
    User: {
        smsregexps: (parent, _, {dataSources}) => dataSources.db.getSmsRegExps(parent.id)
    }
}

exports.resolvers = {
    queryResolvers,
    objectResolvers
};