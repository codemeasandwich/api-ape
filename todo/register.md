we need to think of a system 
instead of Pauline for the health of the platform that we instead register.

maybe as well as type we can also have a property to listen.

e.g.
{"subscribe":"/health","createdAt<!D>":1768382772001,"requestedAt<!D>":1768382772026}
and `"unsubscribe":"/health"`

This would be simple to 
manage on the server as you just add the client sockets to the channel and you can add a extra funtion 'publish(type,data)' to go with brodcast

When a client subscribe they should be send the last message that was publish. this will bring them up to speed.
