---
layout: post
title:  "Securing an IVR with Auth0"
date:   2017-03-12
categories: voice
comments: true
author: Eugenio Pace
---

> Dec 27th, 2023 update: Webtasks have been deprecated.

One of the aspects I enjoy the most about my job, is the chance of working on exciting proof of concepts with customers. Once such opportunity presented itself last week. A customer asked how Auth0 would integrate with an IVR. That sounded like a good challenge.

It turns out that I've implemented an IVR before for a farm automation and data capture system. It works something like this:

* Field operators calls a number from their cellphone.
* _"Press 1 to report death of cow, 2 for birth, 3 for ..."_
* Operator selects number and are prompted for more info: "enter the 5 digit cow identifier"
* When confirmed, the IVR calls an API to record the event.

This solution has been in production for many years and has worked very reliably. One advantage is that it works with minimum footprint:

* Any phone works, even "dumb" ones
* No apps to install/distribute
* All updates are "server side"

All these are pretty good advantages when the operators of this system are 10,000 miles away from you, mind you.

So I knew where to begin.

## The IVR

The IVR platform I used for this is [Tropo](https://www.tropo.com). Which is astonishingly powerful. You can get a phone number anywhere in the world instantaneously, which in itself is a small miracle.

Tropo allows a couple ways of implementing an "App". The simplest is by [hosting scripts](https://www.tropo.com/docs/scripting) on their platform. They support a few languages for this.

Another way is by calling an endpoint someplace else that receives input (in the form a JSON object) and responds back with commands for the IVR to execute:

![](https://s3.amazonaws.com/images.tropo.com/docs/WebAPI_Show_the_Flow.jpg)

I opted for the former, only because this is a very simple app (and I knew the scripting API from before). But with a twist...keep reading.

The required demo script was this:

1. Someone calls a number and is prompted for account number and PIN.
2. User enters both. 
3. System validates user and if successful, prompts a menu for other options (e.g. balance, payments, etc.)

Like with the [Alexa sample I wrote about before](/post/2016-11-09-Alexa-Auth0.markdown), when possible I like to offload all work to a Webtask where the development experience is massively better: 

* A great code editor.
* Real-time logs for troubleshooting.
* A good configuration system.
* Source control integration.

> Any "programmable platform" that doesn't offer a webtask like experience is condemned to be *webtaskified* by me.

Taking this into account, the Tropo script looks like this:

```js
var config = 
{ 
   voice: "Karen",  //A nice Aussie accent
   url: "https://wt-eugenio-pace-gmail-com-0.run.webtask.io/IVR-auth0-demo"
};

//Get Account + PIN
var account = a0_menu("Welcome to the Authzero Demo. Please enter your account number, followed by pound sign", "[1-10 DIGITS]", "#");
var pin = a0_menu("Please enter your 4 digits PIN", "[4 DIGITS]", "#");
   
var username;
   
try{
    //POST to Webtask
    var response = a0_post(config.url + "/validate", "account_number=" + account + "&pin=" + pin);
    
    //Very dumb error handling for the moment
    if(response === 'error'){
        throw {message:("Error authenticating"), code:0}; 
    }

    username = response;
    
}catch(e){
    a0_say("Sorry, wrong PIN or account number. Bye!");
    hangup();
}

a0_say('Welcome ' + username);

//Main menu
var menu = {
 options: {
    "1": accountBalance,
    "2": payments,
    "9": exit
 }
}

// Very important to call this to prevent an angry call 
// from Tropo.
while(currentCall.isActive()){
    a0_menu("Press one for account balance, two for payments, nine to exit", "[1 DIGITS]", "#", menu);
}

function exit(){
 a0_say("Bye!");
 hangup();
}

function accountBalance(){
   a0_say("This is option 1. Account balance.");
}


function payments(){
   a0_say("This is option 2. Payments.");
}

// A bunch of simple wrappers for the Tropo API
// to keep things simpler
function a0_say(msg)
{
   say(msg,{voice:config.voice});
}

// A slightly geekier helper function for menues
function a0_menu(msg,grammar,term,menu){
  var result = ask(msg,
                        {
                          choices: grammar, 
                          bargein:true,
                          mode:"dtmf",
                          voice: config.voice,
                          attempts: 3,
                          terminator: term,
                          onBadChoice: function(event){
                                a0_say("Please try again"); 
                          }
             });

  if(!menu) return result.value;

  //If there's a menu, we assume it is part of a loop, and return true/false
  if(menu.exit && result.value == menu.exit){ return false; }

  if(menu.options[result.value]){
    menu.options[result.value]();
    return true;
  }

  if(menu.invalid_option){
    a0_say(menu.invalid_option);
  } else {
    a0_say("Invalid option");
  }

  return true;
}

// Some lower level infra code, because the Tropo JS
// interpreter requires interfacing with the underlying 
// Java libraries
function a0_post(url, body) 
{ 
  var code; 
  if(body === null)
  { 
    throw {message:"Body is required"}; 
  } 

  try { 
    // Open Connection 
    connection = new java.net.URL(url).openConnection();

    // Set timeout 
    var timeout = 5000; 
    connection.setReadTimeout(timeout); 
    connection.setConnectTimeout(timeout); 

    // Method == POST 
    connection.setRequestMethod("POST"); 

    // Set Content Type 
    var contentType = "application/x-www-form-urlencoded"; 
    connection.setRequestProperty("Content-Type", contentType); 

    // Set Content Length 
    connection.setRequestProperty("Content-Length", body.length); 

    // Silly Java Stuff 
    connection.setUseCaches (false); 
    connection.setDoInput(true); 
    connection.setDoOutput(true);  
  
    //Send Post Data 
    bodyWriter = new java.io.DataOutputStream(connection.getOutputStream()); 
    bodyWriter.writeBytes(body); 
    bodyWriter.flush(); 
    bodyWriter.close();  
  
    code = connection.getResponseCode(); 
  } 
  catch(e) { 
    throw {message:("Socket Exception or Server Timeout: " + e), code:0}; 
  } 
  if(code < 200 || code > 299) { 
    throw {message:("Received non-2XX response: " + code), code:code}; 
  } 
  
  is = null; 
  
  try
  { 
    is = connection.getInputStream(); 
    return (new String(org.apache.commons.io.IOUtils.toString(is))).toString(); 
  }
  catch(e)
  { 
    throw {message:("Failed to read server response"), code:0}; 
  }
  finally
  { 
    try {if(is !== null)is.close();} catch (err){} 
  } 
}

```

The vast majority of the code above is boilerplate code or helper. The fundamentals are pretty straight forward.

## The Webtask based API 

The Tropo JS interpreter is somewhat limited, so instead of calling the Auth0 API directly, I wrote a simple Webtask that acts as a proxy. 

The most complicated operation is a search against the Auth0 `/users` resource. This is needed because the IVR user will not enter an `email` address, but rather a related identifier (the `account_number`). So the `/validate` request performs the following:

1. Gets an Auth0 Mgmt API token.
2. Calls the `api/v2/users` endpoint to search user by `account_number` (in `app_metadata`).
3. If we find the user, we then call another API in Auth0 to authenticate the user.
4. Return the **"greeting"** to the IVR.

![](/media/ivr-sequence.png)

And of course, this is trivial to do on WT, `express` and some `request` calls:

```js
var express    = require('express');
var Webtask    = require('webtask-tools');
var bodyParser = require('body-parser');
var request = require('request');
var async = require('async');
var app = express();

var auth0_domain = "https://YOUR ACCOUNT.auth0.com";

app.use(bodyParser.urlencoded());

app.post('/validate', function (req, res) {

  var account_number = req.body.account_number;
  var pin = req.body.pin;
  var locals = {};
  
  console.log("Validating user with Account Number: " + account_number + " and PIN: " + pin);

  async.series([
      //1. Get an Auth0 API Mgmt Token
      (cb)=>{
        getAuth0APIToken((err,token)=>{
          if(err) return cb(err);
          locals.a0_token = token;
          cb();
        });
      },
      //2. Search user with the account number
      (cb)=>{
        searchUserByAccount(account_number,locals.a0_token,(err,user)=>{
          if(err) return cb(err);
          locals.user = user;
          cb();
        });
      },
      //3. Login users with username/password
      (cb)=>{
        loginUser(locals.users[0].email,pin,(err,login_result)=>{
          if(err) return cb(err);
          if(login_result.error) return cb(login_result.error);
          locals.login_result = login_result;
          cb();
        });
      },
    ],(e)=>{
      if(e) return res.send("error");
      //If all is successful, we send back the ivr_greeting property of he user, so the IVR can say "welcome " + ivr_greeting
      res.send(locals.user.app_metadata.ivr_greeting);
    });
});


//Login function
function loginUser(email,pin,done){
  
  var options = { 
    method: 'POST',
    url: auth0_domain + '/oauth/ro',
    json: { 
      "client_id": "1p.........DktT",
      "username": email,
      "password": pin,
      "connection": 'Username-Password-Authentication',
      "scope": "openid"
    } 
  };

 //login
  request(options, function (err, res, body) {
    if(err) {
      console.log(e);
      return done(new Error(err));
    }
    if(res.statusCode !== 200){
      console.log("Error",res.statusCode );
      return done(new Error(res.statusCode));
    }
    return done(null, body);
  });
}


function getAuth0APIToken(done){
  
  // If we already have an access_token, then use it. WT `global` will live at least 30 min 
  // which in general is lower than the lifetime of the token (although it can be tweaked)
  if(global.access_token) return done(null,global.access_token);

  var options = { 
    method: 'POST',
    url: auth0_domain + '/oauth/token',
    json: {
      client_id:"1paV.....5DktT",
      client_secret:"h4P...YoTg",
      audience: auth0_domain + "/api/v2/",
      grant_type:"client_credentials"
    } 
  };

  //Get AuthZ API token
  request(options, function (err, res, body) {
    if(err) return done(new Error(err));
    if(res.statusCode !== 200) return done(new Error(res.statusCode));
    //Store it in `global` for next time
    global.access_token = body.access_token;
    return done(null, global.access_token);
  });
}

function searchUserByAccount(account,token,done){
  var options = { 
    method: 'GET',
    url: auth0_domain + '/api/v2/users',
    qs: {
      q: 'app_metadata.account_number:' + account,
      search_engine: 'v2'
    },
    headers: {
      Authorization: "Bearer " + token,
    } 
  };

  //Search
  request(options, function (err, res, body) {
    if(err) return done(new Error(err));
    if(res.statusCode !== 200) return done(new Error(res.statusCode));
    done(null,body);
  });
}

module.exports = Webtask.fromExpress(app);

```

A few highlights of the WT:

1. The WT API is registered in Auth0 as a `client` of the management API. That's why I'm using the `client credentials` flow to obtain a token. In Auth0, this `client` is defined to request `read:users` scope, which allows for searching.
2. The `access_token` is cached using Webtasks `global` object as a simple optimization.
3. This implementation takes a few shortcuts: very simplistic error handling, takes 1 result from search, etc.






