"requestedAt" is sent something
{"type":"/health","createdAt<!D>":1768382772001,"requestedAt<!D>":1768382772026}
and missing other
{"type":"/health","createdAt<!D>":1768382802525}

----


The api-ape library converts all endpoint names to lowercase via deepRequire.js:43:


`const endpoint = pathParts.join("/").toLowerCase()`

---
The server returned

{"err":"createdAt ahead of server by `${(createdAt - startTime) / 1000}secs. +${msg}`","type":false,"queryId":"212Y942"}

---

binay data that can be encoded in upto 100 char(base 64) - then in-line it