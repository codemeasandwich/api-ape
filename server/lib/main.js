const loader = require('./loader')
const wiring = require('./wiring')
const expressWs = require('express-ws');
const path = require('path');

let created = false

module.exports = function (app, { where, onConnent }) {

    if (created) {
        throw new Error("Api-Ape already started")
    }
    created = true;
    expressWs(app)
    const controllers = loader(where)

    // Serve bundled client at /ape.js
    app.get('/api/ape.js', (req, res) => {
        res.sendFile(path.join(__dirname, '../../dist/ape.js'))
    })

    app.ws('/api/ape', wiring(controllers, onConnent))
}