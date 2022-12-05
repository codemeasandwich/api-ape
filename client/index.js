const filter = require('../utls/filter')
/*
const petsReq = api.pets( ...data... )

			      // filter: filter's the items that will be in the result Array
			petsReq.filter`name ! ${undefined} AND lastName ? AND bio.checkin > ${10}DaysAgo OR bio.type = ${"admin"}`
			petsReq.fields("*",{bio:["email"]})// defaults to * ~ Max Dept availe <= 4
      // petsReq.dont([12345,22345]) // api should keep track of an Live Refs and add them to skip of only ask for missing feilds

      petsReq.then(tom=>{
      	api(tom) // tom will now to updated if there is an change on the server
      	api(tom.bio)// tom's bio will now to updated if there is an change on the server
      })
*/
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
