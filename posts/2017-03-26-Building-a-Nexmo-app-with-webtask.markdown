---
layout: post
title:  "Building a Nexmo app with Webtask"
date:   2017-03-26
categories: voice
comments: true
author: Eugenio Pace
---

> Dec 27th, 2023 update: Webtasks have been deprecated.

[Nexmo](https://nexmo.com) is a communications platform that allows you to build SMS and voice apps.

Like other systems in this space, Nexmo works as a gateway between the phone networks and your apps. Voice calls or inbound SMS messages are relayed to an endpoint that you host:

![](https://www.nexmo.com/wp-content/uploads/2016/10/diagram-receive.png)

> The basics of this post are inspired on [this post by Nexmo](https://www.nexmo.com/blog/2016/10/27/receive-sms-messages-node-js-express-dr/).

And like other systems that work with webhooks, Nexmo requires you to stand-up a server somewhere that is capable of receiving these requests.

During development, that server is usually running on `localhost`, which is convenient because during this time, you want to accelerate the rate of updates as much as possible. So deploying to a "real" server (e.g. Heroku, AWS, etc.) slows you down.

The problem with this approach is ... `localhost`. Nexmo can only work with a server that is listening on the internet, not on your network. And therefore, the usual solution is to use a proxy like [Ngrok](https://ngrok.com/), that tunnels requests from a public address to the process listening in your machine.

Naturally, I have a better option: [Auth0 Webtasks](https://webtask.io). 

Webtask combines the flexibility of developing on `localhost` and a robust, scalable, Internet addressable runtime, instantaneously available for everyone. 

For this simple example, I wrote an app that simply 
converts your SMS to uppercase and sends the response back to the sender.

The actual code is very simple:

```js
var express    = require('express');
var Webtask    = require('webtask-tools');
var bodyParser = require('body-parser');
var request = require('request');
var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.get('/', function (req, res) {

  //Call the Nexmo API to respond

  request.post('https://rest.nexmo.com/sms/json',{
    qs: {
      api_key: '6d....db',      //Your API keys
      api_secret: '6a.....ef',
      from: req.query.to,
      to: req.query.msisdn,
      text: req.query.text.toUpperCase()   //A lot of business logic here.
    }
  }, function(e,s,b){
    if(e || s.statusCode !== 200 ){       
        console.log('Error', e);
        res.statusCode(500);
    } else {
        console.log('Wow, it worked!', b);
    }
    res.send("ok");  
  });
});

module.exports = Webtask.fromExpress(app);
```

And to prove it works (notice the `[Nexmo DEMO]` added to free accounts):

![](/media/nexmo-demo.jpg)

> The usual `caveat emptor`: you can tell my error handling up there is pretty basic. You'd want to add a more robust approach there. 

Also, Nexmo publishes a [npm module for their APIs](https://www.npmjs.com/package/nexmo) that might be more convenient. Would strongly recommend looking at that if you are building a real app.