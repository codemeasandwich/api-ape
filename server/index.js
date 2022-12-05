const flattenObject = require('../utls/flattenObject')

var eva = ([key,opt,val])=>{
	 switch(opt) {
      case "!":
       return key != val
        break;
      case "=":
       return key == val
        break;
      case ">":
       return key > val
        break;
      case "<":
       return key < val
        break;
      default:
       	throw new Error("Problem with quary: "+JSON.stringify())
    }
}

var where = (target,quary)=>{

target = flattenObject({name: 'tom', bio:{mail: '1@2.3'}, age: 24})
quary=['name', '!', undefined, 'AND', 'age', '>', 10, 'OR', 'bio.mail', '=', '1@2.3', 'OR', 'bio.mail', '=', '1@2.3']
let count =0
quary=quary.reduce((a,x,i)=>{
                count++;
                if(4===count){
                    a.push(x)
                    count =0
                }else{
                    const b = Array.isArray(a[a.length-1]) ? a.pop() : []
                    if(0===i%4) {
                        b.push(target[x])
                    }  else {
                        b.push(x)
                    }
                    a.push(b)
                }
                return a
            },[])
//console.log(quary)
quary.map( q =>{
	if(Array.isArray(check)){
  	return eva(q)
  }
  return q
}).reduce((ok,check,i,a)=>{
	if("string" === typeof check){
  	switch(check) {
      case "AND":
        return a[i-1] && a[i+1]
        break;
      case "OR":
        return a[i-1] || a[i+1]
        break;
      default:
       	throw new Error("Problem with quary: "+JSON.stringify())
    }
  }
    return ok
},true)

} // END where
