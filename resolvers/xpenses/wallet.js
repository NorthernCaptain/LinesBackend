const queryResolvers = {
    wallet: async (parent, {id}, {dataSources, walletCache}) => {
        return walletCache.cached("id", id, async () => dataSources.db.getWallet(id))
    }
}

exports.resolvers = {
    queryResolvers
};