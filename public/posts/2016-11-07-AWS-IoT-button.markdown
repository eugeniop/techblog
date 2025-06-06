---
layout: post
title:  "Trying out AWS IoT Button"
date:   2016-11-07
categories: iot 
author: Eugenio Pace
comments: true
---

> Dec 27th, 2023 update: Webtasks have been deprecated.

I've got 2 dash buttons, configured to order stuff for us at home. They work great.

It was exciting to see Amazon announcement of a "developer" [button](https://aws.amazon.com/iot/button/) that you could play with.

> The AWS IoT Button is a programmable button based on the Amazon Dash Button hardware. This simple WiFi device is easy to configure and designed for developers to get started with AWS IoT, AWS Lambda, Amazon DynamoDB, Amazon SNS, and many other Amazon Web Services without writing device-specific code.

True to what was advertised, the configuration is straight forward. The button acts as WiFi hot spot you connect your computer to. You open a browser, navigate to the device itself (on [http://192.168.0.1/index.html](http://192.168.0.1/index.html) and follow a few simple instructions (mostly downloading a certificate used for authentication) and you are done.

The AWS IoT Service is the backend the button talks to, each time you press the...well the button.

![](https://docs.google.com/drawings/d/1tDuUvOUFhSG2Jp5O1IV0UZk2DIctT6sIqHP69vOV670/pub?w=312&h=140)

The button can send 3 types of events: __single click__, __double click__ and __long click__.

AWS IoT is a little bit confusing (but powerful it seems). What I wanted is to be able to call my own API every time an event is received. And then have that API (for starters), store the event in a MongoDB database.

I guess I could have used AWS Lambda for the whole thing, but I did not enjoy the Lambda development environment. For example, only a few modules are included in the sandbox (and `request` is not one of them), so I would have had to bundle those offline, then upload them. Too much of a hassle. 

I also wanted to keep the security models separate. I want an API in which I could define my own security scopes, I could do data transformation, etc.

Using [Auth0 Webtasks](https://webtask.io) is just perfect for that.

## The solution

![](https://docs.google.com/drawings/d/1-vuuuo3oss2cwlAVxhchY_sfqLgoQBhS7y48CYqxxC8/pub?w=1196&h=490)

The Lambda function uses only built-in modules (`https`) and does 2 things:

1. Obtains a token from Auth0 (the identity server)
2. **POST**s the event to a Webtasks hosted API

The code for the Lambda function is super simple:

```
'use strict';

const https = require('https');

exports.handler = (event, context, callback) => {
    getToken((e,t) => {
       if(e) return callback(e); 
       postJSON('wt-eugenio_pace-gmail_com-0.run.webtask.io','/awsiot',t.access_token,event,(e,r) => {
         if(e) return callback(e);
         callback();
       });
    });
};

//Get an Auth0 Token using the client credentials flow
function getToken(done){
    postJSON('eugeniop.auth0.com','/oauth/token',null,
                {   
                    "client_id":"MEm4......8qlgk2y",
                    "client_secret":"YUR.......UBnCgHz5uPt",
                    "audience":"https://awsiot",
                    "grant_type":"client_credentials"
                },done);
}

//Post JSON to an HTTPS endpoint, expects JSON back
function postJSON(hostname,path,access_token,body,done){
    
    var data = JSON.stringify(body);
    
    var options = {
      hostname: hostname,
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
        }
    };

    if(access_token){
        options.headers["Authorization"] = "Bearer " + access_token
    }

    var req = https.request(options, (res) => {
        var responseData = "";
        res.on('end', () => { 
            console.log(responseData);
            done(null,JSON.parse(responseData)); 
        });
        
        res.on('data', function (chunk) {
            responseData += chunk;
            console.log('Response: ' + chunk);
      });
    });

    req.write(data);
    req.end();

    req.on('error', (e) => {
      done(e);
    });
}
```

Most of this is just boilerplate code. It'd much more compact if I could use `request`. But once this is working, I don't have to change anything. All the development I do in Webtask.

## The Webtask

For the API I'm using the native Express support in Webtask. This makes the setup, configuration and the whole dev experience a breeze.

One of my favorite components of the WT is the [online editor](https://webtask.io/make). It ships with a tester, syntax highlighting, configuration management, source control integration. 

```
'use latest';
import bodyParser from 'body-parser';
import jwt from 'express-jwt';
import express from 'express';
import Webtask from 'webtask-tools';
import { MongoClient } from 'mongodb';

const collection = 'my-button-events';

const server = express();
server.use(bodyParser.json());

// uses client credentials for authorization on the POST
server.use((req,res,next)=>{
  jwt({
    secret: "-----BEGIN CERTIFICATE-----\n" + req.webtaskContext.secrets.issuerPublicKey.match(/.{1,64}/g).join('\n') + "\n-----END CERTIFICATE-----\n",
    algorithms: ['RS256'],
    issuer: req.webtaskContext.secrets.issuer,
    audience: req.webtaskContext.secrets.audience
  })(req,res,next);
});

server.post('/', (req, res, next) => {
  
  var buttonEvent = req.body;
  buttonEvent.dateTime = new Date(); //add timestamp
  
  MongoClient.connect(req.webtaskContext.secrets.mongoUrl, (err, db) => {
    if (err) return next(err);
    db.collection(collection).insertOne(buttonEvent, (err, result) => {
      db.close();
      if (err) return next(err);
      res.status(201).send(result);
    });
  });
});

module.exports = Webtask.fromExpress(server);

```

All the code above is pretty standard. `req.webtaskContext.secrets` is a container for sensitive configuration values that are kept by the WT infrastructure. 

## Authentication 

The Lambda function is registered in Auth0 as a `client` of the API. Notice it is using the **client credentials flow** to obtain a valid token, that is what the first `postJSON` function call does.

The WT is using the `express-jwt` middleware. The `server.use` function ensures all requests to all routes will be checked for a proper, valid `access_token`. 

In this configuration, I chose to use **RS256** as the signing algorithm for the token. The **public key** of the **token issuer** (Auth0 in this case) is used to verify the integrity of the `access_token` being sent in the `Authorization` header.

> The Lambda function is currently requesting an `access_token` from Auth0 every time the button is activated. In a more realistic deployment (e.g. with a large number of buttons), you would likely cache the `access_token` between calls. But I only have one button for the time being...

## What's next?

One natural extension I'd like to build is a simple SPA app (another WT) that will simply display the information captured.
