// Error classes used to reply to the client

class ApiError extends Error {
    httpCode = 500;
    json() {
        return {
            success: false,
            error: this.message
        }
    }
}

class ServerError extends ApiError {
    constructor(message) {
        super(message);
        this.httpCode = 500
    }
}

class ClientError extends ApiError {
    constructor(message) {
        super(message);
        this.httpCode = 400;
    }
}

expressErrorHandler = (error, req, res, next) => {
    if(error.name === 'OAuth2Error') {
        res.status(401).json({success: false, error: error.message, auth: error.message && error.message.includes('expired') ? 'expired' : 'denied'});
    } else
    if(error instanceof ApiError) {
        res.status(error.httpCode).json(error.json());
    } else {
        console.log(error);
        res.status(500).json({
            success: false,
            error: error.message ? error.message : error.toString()
        });
    }
}

exports.ServerError = ServerError;
exports.ClientError = ClientError;
exports.expressErrorHandler = expressErrorHandler;