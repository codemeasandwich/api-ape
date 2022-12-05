const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
/*
function charValue(char){
    return alphabet.indexOf(char.toUpperCase())
} // END charValue

function fromBase32(b32){
    if (0 === b32.length) {
        return 0
    }
    return charValue(b32.slice(-1)) + fromBase32(b32.slice(0,-1)) * 32
} // END fromBase32
*/
function toBase32 (n){
    const remainder = Math.floor(n/32)
    const current = n % 32
    if (0 === remainder) {
        return alphabet[current]
    }
    return toBase32(remainder)+alphabet[current]
} // END toBase32

function jenkinsOneAtATimeHash(keyString){
    
  var hash = 0
  
  for (var charIndex = 0; charIndex < keyString.length; ++charIndex)
  {
    hash += keyString.charCodeAt(charIndex);
    hash += hash << 10;
    hash ^= hash >> 6;
  }
  hash += hash << 3;
  hash ^= hash >> 11;
  //4,294,967,295 is FFFFFFFF, the maximum 32 bit unsigned integer value, used here as a mask.
  return (((hash + (hash << 15)) & 4294967295) >>> 0)
} // END jenkinsOneAtATimeHash

function messageHash(messageSt){
    return toBase32(jenkinsOneAtATimeHash(messageSt))
} // END messageHash

module.exports = messageHash