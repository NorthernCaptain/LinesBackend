
const queryResolvers = {
    user: async (parent, {id, token}, {dataSources, userCache}) => {
        if(id) {
            return userCache.cached("id", id, async () => dataSources.db.getUser(id))
        } else if(token) {
            return dataSources.db.getUserByToken(token)
        }
        return { id: 0 }
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