const linesRouterFunc = require('../routes/lines').router;
const oldsRouterFunc = require('../routes/olds').router;
const authRouterFunc = require('../routes/auth').router;
const expensesRouterFunc = require('../routes/expenses').router;
const {githubPushEvent} = require('../utils/rebuild');
const { wrap } = require('@awaitjs/express');

const initRoutes = (app) => {
    app.use('/', linesRouterFunc(app));
    app.use('/auth', authRouterFunc(app));
    app.use('/oldsdb', oldsRouterFunc(app));
    app.use('/xpenses', expensesRouterFunc(app));

    app.post('/update/on/push', wrap(githubPushEvent));
}

exports.init = initRoutes;