const express = require('express');
const ape = require('api-ape');
const scribbles = require('scribbles');
const path = require('path');
const app = express()
const port = 3000

function onConnent(req, socket, send){
    return {
        embed:{
            clientID:send+"",
            sessionID:req.sessionID,
        },
        onReceive : (queryId, payload, type)=>{
            scribbles.log("before Receive:"+queryId,payload)
            return (err,result)=>{ // after
                scribbles.log("after Receive", result, err)
            }
        },
        onSend : (payload, type)=>{
            scribbles.log("before Send:"+type,payload)
            return (err,result)=>{ // after
                scribbles.log("after Send", result, err)
            }
        },
        onError: (errSt)=>{
          scribbles.error(errSt)
        },
        onDisconnent: ()=>{
          scribbles.info("Disconnent")
        }
    }
} // END ape onConnent

ape(app,{where:"api",onConnent})})

app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public/index.html'));
});
app.get('/build.js', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public/build.js'));
});

app.listen(port, () => {
  scribbles.log(`Example app listening on port ${port}`)
})
