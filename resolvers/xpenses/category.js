const queryResolvers = {
    category: async (parent, {id}, {dataSources, categoryCache}) => {
        return categoryCache.cached("id", id, async () => dataSources.db.getCategory(id))
    },
    categories: async (_, {group_code, typ}, {dataSources}) => dataSources.db.getCategories(group_code, typ)
}

const objectResolvers = {
    Category: {
        parent: async (parent, _, {dataSources, categoryCache}) => {
            return categoryCache.cached("id", parent.parent_id, async () => dataSources.db.getCategory(parent.parent_id))
        },
        children: async (parent, _, {dataSources, categoryCache}) => {
            return categoryCache.cached("by_parent_id", parent.id, async () => dataSources.db.getCategoriesByParent(parent.id))
        }
    }
}
exports.resolvers = {
    queryResolvers,
    objectResolvers
};
