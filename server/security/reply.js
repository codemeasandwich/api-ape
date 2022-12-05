module.exports = function(){
  let requestCheck = []
  return (queryId,createdAt)=>{
    const startTime = Date.now();
     if (createdAt > startTime) {
       throw new Error("createdAt ahead of server by `${(createdAt - startTime) / 1000}secs. +${msg}`")
    }
    const tenSecAgo = startTime - 10000
    if(createdAt < tenSecAgo) {
       throw new Error("request is old by `${(startTime - createdAt) / 1000}secs. +${msg}`")
    }
    
    requestCheck = requestCheck.filter(([passQueryId,createdWhen])=>{
      if (passQueryId === queryId) {
        throw new Error(`Reply: ${queryId} ${msg}`)
      }
      return createdWhen > tenSecAgo
    })
    requestCheck.push([queryId,createdAt])
  } // END checkReply
} // END replySecurity
