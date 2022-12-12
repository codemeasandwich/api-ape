const HyperElement = require('hyper-element');
const ape = require('../../index');//require('api-ape');

document.registerElement("app-root", class extends HyperElement{

  render(Html){
    Html`Api Ape ${this.attrs.who}`
  }// END render

})// END app-root
/*
const petsReq = ape.pets.list(null,(pet)=>{pet.owner == me})
      petsReq.filter`name ! ${undefined} AND owner.checkin > ${10} OR owner.type = ${"nice"}`
      petsReq.fields("*",{toys:["type"]})

      petsReq.then(pets=>console.log(pets))
             .catch(err=>console.error(err))
*/
