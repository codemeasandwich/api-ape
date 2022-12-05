module.exports = function(socket, req, onError){
  onError = onError || console.error
  const origin = extractRootDomain(req.header('Origin') || "");
  const  host  = extractRootDomain(req.header('Host'));
  if (origin && origin !== host) {
    onError("REJECTING socket from "+req.header('Origin')+" miss-match with "+req.header('Host'))
    socket.destroy()
    return false
  }
  return true
}