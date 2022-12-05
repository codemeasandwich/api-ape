const originSecurity = require( '../security/origin')

module.exports = function open(socket, req, onError){

    const isSecure = originSecurity(socket, req, onError)
    if ( ! isSecure) {
       return false;
    }
    return true
}