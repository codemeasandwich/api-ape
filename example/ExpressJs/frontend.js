const HyperElement = require('hyper-element');
const api = require('../../index');//require('api-ape');

document.registerElement("app-root", class extends HyperElement{

  render(Html){
    Html`Ape Chat ${this.attrs.who}`
  }// END render

})// END app-root
/*
const petsReq = api.pets.list(null,(pet)=>{pet.owner == me})
      petsReq.filter`name ! ${undefined} AND owner.checkin > ${10} OR owner.type = ${"nice"}`
      petsReq.fields("*",{toys:["type"]})

      petsReq.then(pets=>console.log(pets))
             .catch(err=>console.error(err))
*/


/*
<div class="file-upload">
	<div class="file-upload-select">
		<div class="file-select-button" >Choose File</div>
    <div class="file-select-name">No file chosen...</div>
    <input type="file" name="file-upload-input" id="file-upload-input">
	</div>
</div>


let fileInput = document.getElementById("file-upload-input");
let fileSelect = document.getElementsByClassName("file-upload-select")[0];
let selectName = document.getElementsByClassName("file-select-name")[0];
fileSelect.onclick = function() {
	fileInput.click();
}
fileInput.addEventListener('change', (event) => {
  const filePointer = event.target.files[0]

		  filePointer.arrayBuffer()
		   .then(arrayBuffer => console.log(arrayBuffer))
	selectName.innerText = filePointer.name;
}, false)
*/
