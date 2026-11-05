const fs=require("fs");
const eng=fs.readFileSync("engine.js","utf8").replace("'use strict';","");
eval(eng+"\n"+fs.readFileSync("test-body.js","utf8"));
