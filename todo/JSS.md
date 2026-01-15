jss should be the pure encoding/deoding of the string. it should support encoding binary data as base64.

however posting and getting data via rest API should be part of a plug-in mechanism. 

so jss is the core that allows you to stand alone in cold JS data. 

anything that requires on mechanisms outside of this simple encoder decoder pattern. must be part of a plug -in System where people can define their own tags that do not clash with the pre-existing ones that are baked in. e.g. the mechanism for transferring files via LINK tag(etc..) must be moved into a plug-in system.

you must do investigation into how other systems and frameworks like this hand has extensions to a language or definition set. based on this you should select the one which is the easiest for a developer to integrate with.

