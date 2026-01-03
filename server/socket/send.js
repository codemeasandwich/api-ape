const jss = require('../../utils/jss')

function checkSocketState(socket) {
  if (socket.readyState !== socket.OPEN) {
    switch (socket.readyState) {
      case socket.CONNECTING:
        throw "The connection is not yet open"
        break;
      case socket.CLOSING:
        throw "The connection is in theprocess of closing."
        break;
      case socket.CLOSED:
        throw "The connection is closed or couldn't be opened."
        break;
    } // END switch 
    //TODO: remove this socket if closed
  } // END if
} // END checkSocketState

module.exports = function sendHandler({ socket, events, hostId }) {

  return function send(queryId, type, data, err) {
    if (!type && !queryId) {
      throw new Error("You must pass a type OR a queryId in-order to send messages")
    }
    if (!data && !err) {
      throw new Error("You must pass a data payload OR an error message in-order to send messages")
    }
    let onFinish = false
    if (!queryId) { // dont call onSend as this will be past of the onReceive Flow
      onFinish = events.onSend(data, type)
    }

    try {
      checkSocketState(socket)
    } catch (err) {
      if (onFinish) {
        onFinish(err, false)
      } else if (queryId) {
        throw err
      } else {
        console.error(err)
      }
      return;
    }
    if (err) {
      socket.send(jss.stringify({ err: err.message || err, type, queryId }))
      if (typeof onFinish === 'function') onFinish(err, true)
    } else {
      socket.send(jss.stringify({ data, type, queryId }))
      if (typeof onFinish === 'function') onFinish(false, data)
    }

  } // END send
} //sendHandler