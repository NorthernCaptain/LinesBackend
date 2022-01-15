const express = require('express');
const { ApolloServer, gql } = require('apollo-server-express');
const fs = require('fs');
const { DateTimeResolver } = require('graphql-scalars')
const IdCache = require('../utils/idcache').IdCache;

const userResolvers = require('../resolvers/xpenses/user').resolvers;
const walletResolvers = require('../resolvers/xpenses/wallet').resolvers;
const categoryResolvers = require('../resolvers/xpenses/category').resolvers;
const smsregexpResolvers = require('../resolvers/xpenses/smsregexp').resolvers;
const expenseResolvers = require('../resolvers/xpenses/expense').resolvers;

const { userInfoByToken, processSync } = require('../services/xpenseService');

const expensesDataSource = require('../db/expenses').apolloDB;

const router = express.Router();

const setup = (app) => {

    initApollo(app).then((apollo)=>{
        router.use('/api', apollo.getMiddleware(
            {
                path: "/aql",
                cors: true,
                disableHealthCheck: true
            }));
    })

    router.post('/api/user', userInfoByToken)
    router.post('/api/sync', processSync)
    return router;
}

const initApollo = async (app) => {

    // Load GraphQL schema from file
    let types=fs.readFileSync('./schemas/graphql/xpenses_types.graphql').toString('utf-8');
    const typeDefs = gql`${types}`;

    // Provide resolver functions for our schema fields
    const resolvers = {
        Query: {
            ...userResolvers.queryResolvers,
            ...walletResolvers.queryResolvers,
            ...categoryResolvers.queryResolvers,
            ...smsregexpResolvers.queryResolvers,
            ...expenseResolvers.queryResolvers
        },
        ...categoryResolvers.objectResolvers,
        ...smsregexpResolvers.objectResolvers,
        ...userResolvers.objectResolvers,
        ...expenseResolvers.objectResolvers,
        DateTime: DateTimeResolver
    };

    // Context func that is run for every request
    const contextFunc = async (req) => {
        return {
            categoryCache: new IdCache(),
            userCache: new IdCache(),
            smsregexpCache: new IdCache(),
            walletCache: new IdCache()
        }
    }

    const server = new ApolloServer(
        {
            typeDefs,
            resolvers,
            context: contextFunc,
            dataSources: () => {
                return {
                    db: expensesDataSource
                }
            }
        });

    await server.start();

    console.log("Initialized Apollo GraphQL server");

    return server;
}

exports.router = setup;