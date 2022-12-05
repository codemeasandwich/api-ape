const loader = require( './loader')
const wiring = require( './wiring')
const expressWs = require('express-ws');

let created = false

module.exports = function(app,{where,onConnent}){
    
    if (created) {
       throw new Error("Api-Ape already started")
    }
    created = true;
    expressWs(app)
    const controllers = loader(where)
    app.ws('/api/ape',wiring(controllers,onConnent))
}