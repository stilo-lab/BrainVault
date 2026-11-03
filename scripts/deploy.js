import {config,requireCredentials} from '../src/config.js';
import {registerCommands} from '../src/registration.js';
import {errorText} from '../src/utils.js';
try{requireCredentials();const result=await registerCommands({token:config.token,clientId:config.clientId,guildId:config.guildId,force:true});console.log(result.count+' Befehle registriert.\nBot einladen: '+result.url);}catch(e){console.error(errorText(e));if(e.inviteUrl)console.log("Bot einladen: "+e.inviteUrl);process.exitCode=1;}
