function filter(strings, args){
  return strings.reduce((a,x,i)=> !x && !args[i] ? a : a.concat(x.trim().split(" "),args[i]),[])

}

module.exports = filter
