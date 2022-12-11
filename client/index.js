const filter = require('../utls/filter')
const connectSocket = require('connectSocket')
/*
const petsReq = api.pets( ...data... ,true/false(default)/(resItem)=>{should listen for on this one y/n} ~ listen for changes)

			      // filter: filter's the items that will be in the result Array
			petsReq.filter`name ! ${undefined} AND lastName ? AND bio.checkin > ${10}DaysAgo OR bio.type = ${"admin"}`
			petsReq.fields("*",{bio:["email"]})// defaults to * ~ Max Dept availe <= 4
      // petsReq.dont([12345,22345]) // api should keep track of an Live Refs and add them to skip of only ask for missing feilds
*/
function checkOpts({domain}){
    if(!domain){
      throw new Error(`Missing domain. Try something like 'apiApe({domain:"my.domain.me"})'`)
    }
    if("string" !== typeof domain
    || ! domain.includes(".")
    ||   domain.includes("/")){
      throw new Error(`Domain is not valuid. You passed:${domain}`)
    }
} // END  checkOpts

function config(opts){
    const { domain } = opts
}

function apiApe(){

  let fieldsToRetun, filterToRetun;

  const prom = new Promise((resolve, reject) => {
  	setTimeout(()=>{
  		api()
  	},0)
  })

  prom.filter = (strings, ...args)=>{
  	if(filterToRetun){
    	throw new Error("You can only set the filter once!")
    }
    filterToRetun = filter( strings, args )

    return prom;
  } // END filter
  //
  prom.fields = (...args)=>{
    if(fieldsToRetun){
      throw new Error("You can only set the keys you want returned once!")
    } else if(0 === args.length){
      throw new Error("You must pass the keys you want returned into 'fields'")
    }
    if(1 === args.length
    && Array.isArray(args[0])){
      args = args[0]
    }
    fieldsToRetun = args
  } // END fields

	return prom
} // END apiApe

export default apiApe
export { config }
