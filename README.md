# api-ape
RPE: Remote procedure events

Server side
```js
const app = express();
ape(app,{where:"api",onConnent})})

function onConnent(req, socket, send){
    return {
        embed:{
            clientID:send+"",
            sessionID:req.sessionID,
        },
        onReceive : (queryId, payload, type)=>{
            console.log("before Receive")
            return (err,result)=>{ // after
                console.log("after Receive")
            }
        },
        onSend : (payload, type)=>{
            console.log("before Send")
            return (err,result)=>{ // after
                console.log("after Send")
            }
        },
        onError: (errSt)=>{
          console.error(errSt)
        },
        onDisconnent: ()=>{
          console.info("Disconnent")
        }
    }
}
```

Client side
```js
                                    // listen for changes
const petsReq = ape.pets.list(null,(pet)=>{pet.owner == me})
      petsReq.filter`name ! ${undefined} AND owner.checkin > ${10} OR owner.type = ${"nice"}`
      petsReq.fields("*",{toys:["type"]})

      petsReq.then(pets=>console.log(pets))
             .catch(err=>console.error(err))
```