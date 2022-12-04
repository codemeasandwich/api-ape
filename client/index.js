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
    filterToRetun = strings.reduce((a,x,i)=> !x && !args[i] ? a : a.concat(x.trim().split(" "),args[i]),[])

    return prom;
  } // END filter

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
