

const petsReq = ape.pets.list(null,(pet)=>{pet.owner == me})
      petsReq.filter`name ! ${undefined} AND owner.checkin > ${10} OR owner.type = ${"nice"}`
      petsReq.fields("*",{toys:["type"]})

      petsReq.then(pets=>console.log(pets))
             .catch(err=>console.error(err))
