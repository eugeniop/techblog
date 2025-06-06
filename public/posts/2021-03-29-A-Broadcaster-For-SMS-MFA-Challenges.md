---
layout: post
title: "A Broadcaster for SMS MFA Challenges"
date:   2021-03-29
categories: sms otp
comments: true
author: Eugenio Pace
---

Many web applications now require MFA which is great to see. Some use time based tokens (TOTP), with application like Google Authenticator to enroll and generate them. Others use SMS messages which are not super secure but better than nothing I guess... Others use a combination: TOTP with SMS as fallback. Very few apps have the sophistication to allow multiple phones to be enrolled on a given account.

> There are many reported issues with SMS based MFA. Please consider other options if you are implementing MFA in your apps.

This little project started with a simple problem: I've got 2 phones (work + personal) and while I carry both most of the time, I sometimes don't have the one I need at hand. Naturally, this seems to happen more often when I need to respond to an SMS MFA challenge.

Also, I am (was) often on an airplane with no access to SMS sometimes (Apple Messages works in misterious ways), but with access to Slack (via de magic of onflight WiFi). Wouldn't it be great to have SMS MFA challenges sent to Slack?


### The SMS Broadcaster

The solution was incredibly straight forward: 

1. Get a Twilio Phone
2. Use that phone in all apps
3. Write a simple API (a webhook in Twilio's lingo) that forwards all messages to your phones/Slack/etc.
4. Enjoy!

The code for the API is very simple (at least as a proof of concept):

```js
const axios = require('axios');
const server = require('express')();

const async = require('async');
const _ = require('lodash');
const twilio = require('twilio');

const { log } = console;

const subscribers = [
  {
    name: "Auth0 Test MFA",
    from: '+12223334444',
    sms: ['+14443332222', '+10009998765'],
    slack: [ process.env.MFA_SLACK_WEBHOOK ]
  },
  {
    name: "Github",
    from: '+15556667777',
    sms: ['+14443332222'],
    slack: []
  }
];

function getSubscriber(from, done){
  log("Looking for ", from);
  const subscriber = _.find(subscribers, (i) => from === i.from);
  if(subscriber){
    return done(null, subscriber); //If we find the origin we just return that
  }
  done(null,   {  //Origin not found (GitHub for example changes the source phone number it seems)
                  name: "Unknown",
                  sms: ['+14443332222', '+10009998765'],
                  slack: [ process.env.MFA_SLACK_WEBHOOK ]
                });
}

// SMS
/*------------ Twilio App Main ---------------*/
server.post('/', twilio.webhook(), smsHandler);
server.get('/', twilio.webhook(), smsHandler); 

function smsHandler(req, res, next){

  const from = req.body && req.body.From ? req.body.From : req.query.From;
  const msg = req.body && req.body.Body ? req.body.Body : req.query.Body; 
  
  getSubscriber(from, (e,subscriber) => {

    if(e){ 
      log('Error retrieving subscriber');
      console.log(e);
      return res.status(200).end();
    }

    if(!subscriber){
      log('No Subscriber!');
      return res.status(200).end();
    }

    function buildBroadcastingWorkers(){
      var workers = [];

      //This builds SMS broadcasters
      if(subscriber.sms){
        const s = _.map(subscriber.sms, (phone) => {
                                        return function(cb){
                                                  log("SMS to phone:", phone);
                                                  return sendSMSToRecipient(process.env.MFA_FROM_PHONE, phone, `MFA challenge from ${subscriber.name}\n${msg}`, cb);
                                                };
                    });
        workers.push(...s);
      }

      //This one adds slacks
      if(subscriber.slack){
        workers.push( ..._.map(subscriber.slack, (slackWH) => {
                          return function(cb){
                                    const options = { 
                                            method: 'POST',
                                            url: slackWH,
                                            headers: { 'content-type': 'application/json' },
                                            data:  {
                                                      username: 'MFA Broadcaster',
                                                      text: `*New MFA challenge*\n From: ${subscriber.name}\n\n\`\`\`\n${msg}\n\`\`\``,
                                                      channel: '#mfa', 
                                                      icon_emoji: ':key:'
                                                    }
                                          };
                                    axios(options)
                                      .then(res => {
                                        log('Sent to SLACK');
                                        console.log(res.data);
                                        cb();
                                      })
                                      .catch(err => {
                                        console.log(err);
                                        cb(err);
                                      });
                                }
                          }));
      }

      return workers;
    }

    async.series(
      buildBroadcastingWorkers(),
      (error) => {
        if(error){
          log("Error broadcasting OTP Message");
          log(error);
        } else{
          log("OTP Message broadcasted!");
        }
        return res.status(200).end();
      }
    );
  });
}

function sendSMSToRecipient(from, to, msg, done){
  var tw = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  tw.messages
          .create({
                    to: to,
                    from: from,
                    body: msg
                  }, done);
}
```

#### Disclaimers

Usual disclaimers apply. There's plenty here missing. To name a few:

1. Not a lot of error handling.
2. No rate limiting on the API (I guess you can front it with Cloudflare or equivalent).
3. There's no bootstrap code (e.g. no signup). Notice the `subscriber` array is _hardcoded_. 
4. SMS is not that great as an MFA factor. I would strongly advice everyone to consider other alternatives, but alas, we live in an imperfect world.


So...use at your own risk. 

