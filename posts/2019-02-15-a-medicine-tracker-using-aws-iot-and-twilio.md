---
layout: post
title:  "A Pill Tracker using AWS IoT and Twilio"
date:   2019-02-15
categories: iot sms
comments: true
author: Eugenio Pace
---

A couple of members in the family take regular pills every day. I wanted to give them a mechanism to:

1. Track whether they had taken them or not.
2. Notify them if they forgot.
3. Notify others (e.g. a guardian, parent) when they don't check-in.

### The requirements

1. The device that captures the check-in of the user must be super simple ("one-click"), and as close to the pills as possible.
2. The device must be portable. Easy to move around.
3. The notification will be delivered to the phone of the user (and/or the guardian).
4. Users (pill takers and guardians) can request simple reports.
5. Inexpensive :-)

### The solution

The AWS IoT button is ideal for an app like this. I attached one on each pill case:

![](https://docs.google.com/drawings/d/e/2PACX-1vS4YbbWPKFkre3Ro9CvNxrED-dERC7YzWbKXqMnpy-PuMXkeRnKjpA1sjhrNEotgW_KdpZo2VbJDRlr/pub?w=371&h=380)

Every box has a different button. The user simply presses the button after she takes the pills.

The button is programmed to execute a Lambda function (all buttons are wired to the same standard Lambda function), that then calls an API to record the event in a database.

> I strongly recommend using the mobile (iPhone) AWS IoT app for registering new buttons. It makes the job way easier.

A separate cronjob runs every morning, checks when the last event was recorded for each subscriber and sends a message. If it finds no check-in it will send a reminder: `Hey, you might have missed your pills`. If there is a recent check-in the message will switch to `Good job!`. 

The high-level components look like this:

![](https://docs.google.com/drawings/d/e/2PACX-1vThLbSA_tk-hpQjiOCEBBSg0W7EpNWqbT2d-Q43PFHv0Bm_QX9rSinmnwopR5RyFV-JwwqvhHqW4kq0/pub?w=1159&h=567)

#### The Data model

The data model for the system is straight forward. There're two collections:

1. Subscribers
2. Log

Subscribers list all registered users of the system, their phone, and their button.

```js
{
    "_id": {
        "$oid": "5b5........de"
    },
    "name": "Eugenio",
    "buttonId": "G0..........X",
    "phone": "+14442223333",
    "active": true,
    "notifyTo": [
        "+14254254254"
    ]
}
```

The `notifyTo` is an array of phones to send notifications to for this particular subscriber.

The log is a collection of all check-ins:

```js
{
    "_id": {
        "$oid": "5bd........55"
    },
    "subscriber": {
        "_id": {
            "$oid": "5b5........de"
        },
        "name": "Eugenio",
        "buttonId": "G0..........X",
        "phone": "+14442223333",
        "active": true,
        "notifyTo": [
            "+14254254254"
        ]
    },
    "createdAt": {
        "$date": "2018-10-28T05:20:36.497Z"
    },
    "source": "button"
}
```

The `subscriber` attribute is just a copy of the `Subscriber` object at the time the event was recorded. I copy the object here because it simplifies the query later on (e.g. `getLastEvent`). The tradeoff is some redundancy.


#### The Lambda 

All buttons are wired up to the same (never changing) lambda function:

```js
'use strict';

const https = require('https');

exports.handler = (event, context, callback) => {
    event.requestId = new Date().getTime();
    getToken((err, token) => {
        if(err) return callback(err);
        postJSON('ulifeapps.herokuapp.com',
                '/pilltracker/event',
                { Authorization: 'Bearer ' + token },
                event,
                (e,r) => {
                    if(e) { return callback(e); }
                    callback();
        });
    });
};

function getToken(done){
    var body = {
            client_id: "9a6...........m6",
            client_secret:"JK..............",
            audience:"https://theApp/pilltracker",
            grant_type:"client_credentials"
    };
    
    postJSON('YOUR_DOMAIN.auth0.com', '/oauth/token', null, body, (err, response) => {
      if(err){ return done(err); }
      done(null, response.access_token);
    })
}

//Post JSON to an HTTPS endpoint, expects JSON back
function postJSON(hostname, path, headers, body, done){
    
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

    if(headers){
        for(var property in headers){
            if(headers.hasOwnProperty(property)) {
                options.headers[property] = headers[property];        
            }
        }
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

The function is, in essence, a proxy. It just calls the backend API with the button's payload. The only important thing here is that the function gets a token from Auth0 via the `client_credentials` flow.

> There's no optimization here on obtaining the `access_token`. A real system would like cache the token until it expires. But given the traffic on this little app, I'm not bothering with that.

#### The API

The API is an nodejs/Express app, roughly:

```js
server.post('/', jwtAuthz(['write:events'], { failWithError:true }), (req, res, next) => {
  var event = req.body;

  domain.storeEvent(
    {
      buttonId: event.serialNumber,
    },
    null,
    e => {
      if (e) return next(boom.serverUnavailable(e));
      return res.json({
        result: 'ok',
      });
    });
});
```

Nothing particularly special, except the use of two middlewares:

1. [express-jwt](https://github.com/auth0/express-jwt)
2. [express-jwt-authz](https://github.com/auth0/express-jwt-authz/)


The first one checks for a valid JWT on each call (e.g. checks `audience`, `issuer`, `expiration` and `signature`):

```js
const jwt = require('express-jwt');
const jwks = require('jwks-rsa');

var jwtCheck = jwt({
    secret: jwks.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: "https://{YOUR AUTH0 DOMAIN}.auth0.com/.well-known/jwks.json"
    }),
    audience: 'https://myapps/pilltracker',
    issuer: "https://{YOUR AUTH0 DOMAIN}.auth0.com/",
    algorithms: ['RS256']
});
``` 

The second middleware checks for scopes. The Lambda `client` is configured to request `write:events`. That's why the API uses this middleware:

```js
jwtAuthz(['write:events'], { failWithError:true })
```

Any token _without_ `write:events` in the scope, will fail with a 403.

#### The Cron job

For the cron, I am using the simple Heroku [Scheduler add-on](https://devcenter.heroku.com/articles/scheduler), that is adequate for this lightweight job.

To make things a little bit more interesting, there are a bunch of different messages that are randomly sent.

```js
/*
  This script is invoked by a scheduler.
  The scheduler runs @ 9 AM PST and:

  1. Checks the last check-in for each subscriber
  2. If the last check-in is <= 4 sends an "on-time" msg to the subscriber and "notifications_ontime" to "notifyTo" numbers of a subscriber if present.
  3. If the last check in > 4 it sends "late" messages.
*/

require('dotenv').config();

const async = require('async');
const moment = require('moment-timezone');
const util = require('util');

const domain = require('./domain');
const sms = require('../../sms');

var time_pst = parseInt(moment().tz("America/Los_Angeles").format('H'));

//This scheduled script will only run at 9AM PST
if(time_pst !== 9){
  return;
}

const messages = {
  late: [
    "Remember the pills. It is been %s hs. since your last checkin...",
    "Friendly reminder to take your pills (Last checkin: %s hs. ago)",
    "Your pills! Last checkin was %s hours ago",
    "TAKE YOUR PILLS! Last checking was %s hours ago",
    "Please check if you've taken your pills (last checking was %s hours ago)"
  ],
  ontime: [
    "Good job taking your pills today.",
    "Thanks for checking in with the pill reminder.",
    "Well done! You took your pills.",
    "Excellent. You took your pills today."
  ],
  notifications_ontime: [
    "%s has taken his pills",
    "%s has checked in with the Pill Tracker",
  ],
   notifications_late: [
    "%s has not checked in with the Pill Tracker yet",
    "%s has NOT checked in with the Pill Tracker",
    "%s might have missed pills today",
    "Please check in with %s regarding the pills"
  ]
};

domain.getSubscribers(0, (e, subscribers) => {
  if(e) return console.log('Pilltracker.Cron - Cannot retrieve subscribers for ' + time_pst + " hours", e);
  if(subscribers.length === 0) return console.log('Pilltracker.Cron - No subscribers for ' + time_pst + " hours");
  async.each(subscribers, (subscriber, done)=>{
          processSubscriber(subscriber, done);
        },
        (each_error, results)=>{
            if( each_error) return console.log('Pilltracker.Cron - Error processing subsciber', each_error);
        });
});

function processSubscriber(subscriber, done){
  domain.getSubscriberLastEvent(subscriber, (error, event)=>{
    if(error){ return done(error); }
    var now = moment();
    var lastCheckIn = moment(event.createdAt);
    var duration = Math.round(moment.duration(now.diff(lastCheckIn)).as('hours'));
    var subscriber_msg = "";
    var notifier_msg = "";
    if(duration <= 4){ 
      //If recent, we consider "on time". recent is less than 4 hours ago
      subscriber_msg = getRandomMessage(messages.ontime);
      notifier_msg = getRandomMessage(messages.notifications_ontime);
    } else {
      //If > 4 hours ago, we consider LATE.
      subscriber_msg = getRandomMessage(messages.late);
      subscriber_msg = util.format(subscriber_msg, duration);
      notifier_msg = getRandomMessage(messages.notifications_late);
    }
    notifier_msg = util.format(notifier_msg, subscriber.name);
    notifySubscriber(subscriber, subscriber_msg, notifier_msg, (e)=>{
      done(e);
    });
  });
}

function getRandomMessage(msgs){
  return msgs[Math.round((Math.random() * (msgs.length - 1)))];
}

//Sends a notification (on time or late) to the subscriber and optionally to all
//interested in tracking the event (Dad and Mom)
function notifySubscriber(subscriber, s_msg, n_msg, done){
    var tasks = [function(cb){
                    sms.sendSMSToRecipient(process.env.PILLTRACKER_FROM_PHONE, subscriber.phone, s_msg, cb);
                }];
    if(subscriber.notifyTo){
      subscriber.notifyTo.forEach((phone)=>{
        tasks.push(function(cb){
          sms.sendSMSToRecipient(process.env.PILLTRACKER_FROM_PHONE, phone, n_msg, cb);
        });
      });
    }
    async.parallel(tasks, done);
}
```

#### The SMS interface

The system primarily sends messages to subscribers, but just for fun, I added a simple interface for interactive queries. The same API used to receive events hosts a webhook for Twilio.

The webhook is protected with the built in Twilio middleware.

```js
const express = require('express');
const server = express.Router();
module.exports = server;

const async = require('async');
const _ = require('lodash');
const util = require('util');
const moment = require('moment-timezone');
const twilio = require('twilio');

const sms = require('../../sms');
const domain = require('./domain');

// SMS
/*------------ Twilio App Main ---------------*/
server.post('/', twilio.webhook(), smsHandler);
server.get('/', twilio.webhook(), smsHandler); 

function smsHandler(req, res, next){
  //Commands on SMS are of the format: {c} {args}
  var { verb, command } = sms.parseInput(req);
  var phone = sms.getPhone(req);
  var locals = {};

  async.series(
    [
      cb => {
        domain.getSubscriber({ phone: phone }, (gs_err, subscriber) => {
          if (gs_err) return cb(gs_err);
          locals.subscriber = subscriber;
          cb();
        });
      },
      cb => {
        var menu = [
          {
            name: 'Check in with the Pill tracker',
            help: '"c" No arguments are needed',
            verbs: ['c', 'ci'],
            requiresSubscription: true,
            handler: done => {
              checkin(locals.subscriber, command, done);
            },
          },
          {
            name: 'Last Checkin',
            help: '"lc {name}" {name} is optional. If ommited, command will return last checkin of the phone used to send the command.',
            verbs: ['lc', 'last', 'l'],
            requiresSubscription: true,
            handler: done => {
              getLastCheckin(locals.subscriber, command, done);
            },
          },
          {
            name: 'Summary',
            help: '"s". Returns a summary of all Subscribers\' last check-in.',
            verbs: ['s', 'sum', 'su'],
            requiresSubscription: true,
            admin: true,
            handler: done => {
              summary(locals.subscriber, done);
            },
          },
          {
            name: 'Help',
            help: 'Get help on command. e.g. "h lc"',
            verbs: ['h', 'help'],
            handler: done => {
              //help
              if (!command) {
                return done(null, sms.buildHelp(menu));
              }
              var menuEntry = sms.findMenuEntry(menu, command);
              if (menuEntry) {
                done(null, menuEntry.help);
              } else {
                done(
                  null,
                  util.format(
                    'Invalid command: [%s]\nAvailable commands:\n%s',
                    command,
                    sms.buildHelp(menu)
                  )
                );
              }
            },
          },
        ];

        var menuEntry = sms.findMenuEntry(menu, verb);
        var canExecute = sms.canExecuteCommand(verb, menuEntry, locals.subscriber);

        if(canExecute.result){
          menuEntry.handler((e, msg) => {
                              locals.smsResponse = e ? util.format("ERROR: %s", msg) : msg;
                              cb();
                            });

        } else {
          locals.smsResponse = canExecute.whyNot; 
          cb();
        }
      },
    ],
    (error) => {
      sms.sendSMSResponse(
        res,
        error ? util.format('ERROR. Please try again. [%s]', error) : locals.smsResponse
      );
    }
  );
}

function getLastCheckin(subscriber, name, done) {
  // Last checkin for subscriber him/herself
  var locals = {
    subscriber: subscriber
  };

  if(!subscriber && !name) return done(null, "LAST CHECK IN: invalid subscriber");

  async.series([
    cb => {
      if(!name){ return cb(); }
      domain.getSubscriber({ name: name }, (query_error, sub) => {
        if (query_error || !sub){ return cb(util.format('LAST CHECK IN: subscriber with name %s not found', name)); }
        locals.subscriber = sub;
        cb();
      });
    },
    cb => {
      domain.getSubscriberLastEvent(locals.subscriber, (gl_error, event) => {
        if (gl_error) return cb('LAST CHECK IN: Cannot retrieve last checking for ' + locals.subscriber.name);
        if (!event) return cb("LAST CHECK IN: " + subscriber.name + ' has no checkins');
        locals.event = event;
        cb(null);
      });
    }
  ], (e) => {
    if(e) return done(null, e);
    done(null, util.format('Last checkin for %s was at %s, using %s',
                            locals.subscriber.name,
                            moment(locals.event.createdAt)
                              .tz(locals.subscriber.tz)
                              .format('ddd. MMM Do, H:mma - z'),
                            locals.event.source));
  });
}

function checkin(subscriber, msg, done) {
  if(!subscriber) return done(null, "Invalid subscriber");
  domain.storeEvent({ phone: subscriber.phone, message: msg }, subscriber, e => {
    if (e) return done(e, 'Checkin failed. Please try again');
    done(null, 'Thanks for checking in ' + subscriber.name);
  });
}

function mapEvents(events, tz) {
  if (!events || events.length === 0) return [];
  return _.map(events, e => {
    if (!e) return {};
    return {
      createdAt: !tz ? e.createdAt : moment(e.createdAt)
            .tz(tz)
            .format(),
      name: e.subscriber.name,
      source: e.source,
      message: e.message,
    };
  });
}

function summary(subscriber, done){
  if(!subscriber || !subscriber.admin){ return done(null, "Invalid subscriber") };
  domain.getSubscribers(0, (gs_e, subscribers) => {
    if(gs_e) return done(null, "Summary. Could not retrieve subscribers");
    var summary = "Last check-ins:\n";
    async.series(_.map(subscribers, (s) =>{
        return (cb) => {
          domain.getSubscriberLastEvent(s, (gsle_e, le) => {
            if(gsle_e) return cb(gsle_e);
            var lastCheckIn = moment(le.createdAt);
            var duration = Math.round(moment.duration(moment().diff(lastCheckIn)).as('hours'));
            summary += util.format("%s - %d hs.\n", s.name, duration);
            cb();
          });
        };
      }),
      (as_e) => {
        if(as_e){ return done(null, "Summary. There was a problem retrieving the information."); }
        done(null, summary);
      });
  });
}
```

### Future developments

We've been using the system for almost a year now. One obvious possible enhancement is adding multiple times during the day. But...nobody needs that right now, and I have many other projects going on, so it will be for sometime in the future.


> "Do every act of your life as if it were your last. It is not death that a man should fear, but he should fear never beginning to live." — Marcus Aurelius