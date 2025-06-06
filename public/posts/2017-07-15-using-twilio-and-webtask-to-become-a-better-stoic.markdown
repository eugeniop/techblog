---
layout: post
title:  "Using Twilio and Auth0 Webtask to become a better stoic"
date:   2017-07-15
categories: auth0 twilio
comments: true
author: Eugenio Pace
---

> Dec 27th, 2023 update: Webtasks have been deprecated.

I like to read a couple random paragraphs of [Marcus Aurelius'](https://en.wikipedia.org/wiki/Marcus_Aurelius) [Meditations](https://en.wikipedia.org/wiki/Meditations) every morning. It's one of various routines that helps me get organized and start the day.

As much as I like the actual book, I wanted to share the daily dose of reflection and wisdom with my family and friends, so I built an SMS based system that delivers a daily paragraph of Marcus' meditations every morning.

## Architecture

The solution consists of:

1. A database of quotes I've built from publicly available texts. Many sources for this.
2. An API to query the database and add/remove subscribers.
3. A Twilio "app" that receives SMS requests and calls the API.
4. A cron job that calls the API to pick a (random) quote of the day, and sends the SMS to all active subscribers.

![](https://docs.google.com/drawings/d/1XbZTlDL5MLHY3jmB9QpAVRNc_Hh-PqKyQJfnYEnYUkM/pub?w=917&h=401)

The **database** is an [mlab](https://mlab.com) free tier database. In retrospect, given that my storage requirements are fairly modest (< 500KB), I could have easily used Webtask storage. Perhaps something to consider in the future.

The **API** and the **Twilio app** are [Webtask](https://webtask.io) based systems (the same webtask actually, with differnt endpoints). The **cron job** is a `cron webtask` that queries the API and then uses Twilio's API to send the SMSs.

> Why have the cron webtask use an API instead of querying the database directly? Only because I want to be able to change the storage later on and make those changes in one place.

### Twilio app

The twilio SMS number is configured to call my webtask on the `/sms` endpoint:

![](/media/twilio-maq.png)

```js
import bodyParser from 'body-parser';
import express from 'express';
import Webtask from 'webtask-tools';
import { MongoClient } from 'mongodb';
import util from 'util';
import twilio from 'twilio';
const server = express();

server.use(bodyParser.json());
server.use(bodyParser.urlencoded({extended: false}));

server.post('/sms', (req, res, next) => {
  
  if(twilio.validateExpressRequest(req,req.webtaskContext.data.TW_AUTH_TOKEN, {protocol: 'https'}) === false){
    return next('Unauthorized. Only accepts requests from Twilio.');
  }

  const { MONGO_URL } = req.webtaskContext.data;

  var actions = {
    s: subscribe,
    S: subscribe,
    u: unsubscribe,
    U: unsubscribe,
    Q: quote,
    q: quote,
    h: help,
    H: help,
  };
  
  var verb = req.body.Body.substring(0,1);
  
  if(actions[verb]){
      return actions[verb](MONGO_URL, req.body.From,(e,msg) => {
      if(e) { msg = "Oops. Something went wrong."; }
      sendSMSResponse(res,msg);  
    });
  } else {
    sendSMSResponse(res,util.format("Command not recognized: [%s]\n%s", verb, help_message));
  }
});

function sendSMSResponse(res,msg){
  var twilio = require('twilio');
  var twiml = new twilio.TwimlResponse();
  twiml.message(msg);
  res.writeHead(200, {'Content-Type': 'text/xml'});
  res.end(twiml.toString());
}
```

The `actions` are simple functions like this:

```js
function help(mongo,phone,done){
  done(null, help_message);
}

function udpateSubscription(mongo,phone,active,done){
  MongoClient.connect(mongo, (err, db) => {
    if (err) return done(err, "System error. Please try sometime else");
    db.collection(subscribers_collection)
      .update({phone: phone}, {phone: phone, active: active}, {upsert: true}, (err,count,status) => {
        db.close(); 
        if(err) { return done(err,"There was an error updating your subscription. Try again!"); }
        done(null, active ? "Welcome to Eugenio's Daily Marcus Aurelius. You'll get a daily message every day at 6:30am PST.\n" + help_message  : 
                            "Sad to see you go! VALE");
      });
  });
}
```

### Securing your Twilio endpoint

Twilio sends a special header `X-Twilio-Signature` to compute a digital signature using secrets (the `AuthToken`), the URL of the webhook, etc. Fortuntately, there's a library you can use that simplifies this validation:

```
...
if(twilio.validateExpressRequest(req,req.webtaskContext.data.TW_AUTH_TOKEN, {protocol: 'https'}) === false){
  return next('Unauthorized. Only accepts requests from Twilio.');
}
...

```

The library also exports a middleware you can simply inject in the router, but that's something I can't do, because the secret (the `AuthToken`) is stored in Webtask infrastructure. The other minor thing is that while the Webtask itself is on `https`, the value of `req.protocol` returns `http`, thus breaking the signature. This is likely because of the internal Webtask architecture. Fortunately, the library allows you to override this and everything just works.

## The cron job 

Auth0 Webtask supports [scheduled jobs](https://webtask.io/docs/editor/cron), which makes this task trivial. The code for mine looks like this:

```js
var request = require('request');
var async = require('async');
var _ = require('lodash');

module.exports = function(ctx, cb) {
  
  var accountSid = ctx.data.TW_ACCOUNT_SID; 
  var authToken = ctx.data.TW_AUTH_TOKEN; 

  var twilio = require('twilio')(accountSid, authToken);
  
  request.get('https://{YOUR WEBTASK URL}/quote_of_the_day',{
    headers: {
      Authorization: 'Bearer ' + ctx.data.API_TOKEN
    }
  },
  (e,s,b) => {

    if(e) return cb(e);
    
    var quote_of_the_day = JSON.parse(b);
    
    var tasks = _.map(quote_of_the_day.subscribers, (phone) => {
        return function(callback){ 
                    twilio.messages.create({ 
                        to: phone, 
                        from: "+12......6", 
                        body: quote_of_the_day.quote.en, 
                    }, callback);
                }; 
      });

    async.parallel(tasks,
      (e,r) => {
        if(e) return cb(e);
        cb(null,{results: r});
      });
  });
};
```

The `quote_of_the_day` endpoint returns an object that looks like this:

```
{
  "subscribers":["+1.......8","+1.......7","+1........2","+1........0"],
  "quote":{
    "en":"Think nothing profitable to you which compels you to break a promise, to lose your self respect, to hate any person, to curse, to act the hypocrite."
  }
}
```

`subscribers` is an array of phones. `quote` has the same quote in multiple languages. I thought about doing a translation eventually (not implemented yet), so each subscriber can optionally request quotes in a different language. For now, English is the only one supported. 

The schedule:

![](/media/maq-cron.png)

## Caveats

There's no bulk SMS API in Twilio that I could find, so I'm sending individual requests one after the other (using `async.parallel`). Likely not a great way of doing it if we are dealing with 1000's of subscribers. 

Webtasks have a absolute running timeout of 30 secs. There're no provisions here to deal with this hard limit.



## See it in action?

Want to become a better stoic? Enjoy Marcus Aurelius? DM me on [Twitter](https://twitter.com/eugenio_pace) and I'll message back the subscription number. Send `h` or `H` to it, and you will see:

```
Commands:
U|u:unsubscribe
S|s:subscribe
Q|q:get an instant quote
H|h:help
```

Sending an `s` will add your phone to the collection of subscribers. Sending a `q` anytime will return an instant quote. After you subscribe you will get a quote automatically every day, at 6:30am PST.


## Closing

_Think of all the years passed by in which you said to yourself "I'll do it tomorrow," and how the gods have again and again granted you periods of grace of which you have not availed yourself. It is time to realize that you are a member of the Universe, and know that there's a limit that has been set to your time. Use every moment wisely, to perceive your inner refulgence, or it will be gone and nevermore within your reach._ 

Marcus Aurelius