---
layout: post
title: "Experiments with Vestaboard"
date:   2022-05-09
categories: vestaboard
comments: true
author: Eugenio Pace
---

A few weeks ago I finally got a [Vestaboard](https://www.vestaboard.com/) after a long wait. It is a beautiful piece of hardware. Very well built, super high quality. And it brings memories of standing in train stations and airports long time ago.

Setup was straightforward and I was able to send messages right away with the mobile app.

![](/media/vesta-board-1.gif)

I wanted to test out its API so I started looking for docs. A few searches and clicks landed me on the developer portal (yeah!), and shortly after that I was reading [the docs](https://docs.vestaboard.com/introduction) and learning how to interact programmatically.


This [section](https://docs.vestaboard.com/concepts) includes very important definitions of of the abstractions of the API.

## Authentication

Authentication for the API uses an `API key/secret` pair. Not uncommon, but not exactly using the more standard (perhaps) approach of relying on the OAuth2 protocol (with a combination of `refresh_tokens`. Not a big deal though.


## Sending messages via the API

You post messages to a `Subscription` which (if you read the concepts section) is:

> A user can allow an Installation to post messages to a Board by creating a Subscription between that Installation and Board. The Installation can then discover the new Subscription and begin posting to it. Subscriptions always require reference to an Installation, however for Installables without Tenant-level detail (see the Installation section above), an Installation may be created automatically when the first Subscription for an Installable is created in a Tenant. Subscriptions may also have subscription-level settings, such as the Slack channel with which to integrate, or a postal code for which to show weather information.


Because posting a message requires knowing the `subscription` I am calling first the `list subscriptions` endpoint. Then pick up the first one (as I only have one board).

1. List subscriptions
2. Post message


## Where do messages come from?

I have a little app with a database of quotes I like. My app sends a daily SMS to my phone. If I like the quote, I can reply with a command to "print it". "Printing it" means send it to either:

1. A thermal printer
2. An e-ink display
3. A Vestaboard (now)

In all cases, the command I send via SMS ends up putting a message on a queue (one per device). All devices poll for new messages and if a message is available, will print the quote.

My Thermal printer and e-Ink displays are Arduino based, so the polling code runs there. In the case of the Vestaboard, I don't have access to the hardware, so instead I have a cron job running on my back-end that simply polls the queue for a message, and if one is there, will call the Vestaboard API.


## The Cron

```js
const domain = require('../domain');  // A bunch of functions to interact with my backend.
const _ = require('lodash');
const axios = require('axios');
const async = require('async');

const { log } = console;

const vestaboards = [{
  device_id: process.env.VESTABOARD_CLIENT_ID,      // This identifies the board with my backend
  api_key: process.env.VESTABOARD_API_KEY,          // Used for Vesta API
  api_secret: process.env.VESTABOARD_API_SECRET
}
];

function printHandler(v, msg, done){

  const headers = {
    'X-Vestaboard-Api-Secret': v.api_secret,
    'X-Vestaboard-Api-Key': v.api_key
  };
  
  /*
    The Subscription API returns:
    {
      "subscriptions": [
      {
        "_id": "4e79..................1f458",
        "_created": "1644537083760",
        "title": null,
        "icon": null,
        "installation": {
        "_id": "a982....................a61",
        "installable": {
          "_id": "4f2...................06"
        }
        },
        "boards": [
        {
          "_id": "9f6....................76"
        }
        ]
      }
      ]
      }
  */

  axios.get('https://platform.vestaboard.com/subscriptions', { headers })
    .then( response => {
      const sub_id = response.data.subscriptions[0]._id;    // I only have one

      var text = msg.text + " - " + msg.author;

      axios.post(`https://platform.vestaboard.com/subscriptions/${sub_id}/message`, {text: text}, { headers })
        .then( result => {
          domain.ackCommandAndNotifyResult(v.device_id, {     //This domain function simply acknowledges the initiator of the request (my phone)
                                  ack: cmd.ack,
                                  body: {
                                        encoded: false,
                                        text: "Board updated!"
                                      },
                                  },
            (e,printJob) => {
              if(e) log('Ack failed');
              done(); 
            });
        })
        .catch(error => {
          log('Error posting to VESTA' + error);
          done(error);
        })

    })
    .catch(error => {
      log('Error getting subscriptions from VESTA' + error);
      done(error);
    });
}

//Builds an array for tasks that print messages to Vesta
const print_tasks = _.map(vestaboards, (v) => {
  return async.reflect(
    function(cb){
      domain.getCommandForDeviceAndNotifySubscriber(v.device_id, (e, cmd) =>{ //Pulls messages from the device Queue
        if(e){ return cb(e); }

        log("Vestaboard. Command retrieved", cmd);

        if(!cmd){
          log("No quotes to print or commands to process for " + v.device_id);
          return cb();
        }
        printHandle(v, cmd, cb);
      });
    }
  );
});

module.exports = {
  name: 'Vestaboard print job',
  schedule: "0/1 * * * *", //Every 1 min
  description: "Vestaboard printing job",
  job: () => {
    async.parallel(print_tasks, (e) =>{
    if(e) {
      log("Error in Vestaboard execution");
      log(e);
    }
  });
  }
}
```

## Notable missing parts / caveats / notes

* Bootstrapping here is done manually: I hardcoded the array I called `vestaboards`. 
* Notice I use `async.reflect`, a neat function I learned about while researching this implementation. 
* Also notice that the job is exported and plugs into y cronjob framework described [here](/post/2022-04-02-running-scheduled-tasks-in-heroku.md).
* The logging infrastructure is pretty primitive (a.k.a. `console.log`)
* Minimal exception handling
* No *paging*: paging (for long quotes) is not an issue in Thermal printers. The only limit for a quote length is the amount of paper left. e-Ink displays have limited space, so I implemented a "scrolling" function that will split long quotes into parts and rotate each part over time. None of the logic is implemented in this version for the Vestaboard. So, long quotes are just truncated. 
* It is very nice that the board have built-in logic for spreading the text across all characters. It also skips identical messages.

## Future enhancements

So many :-). The most important ones being:

* Error logging (a slow progressing project now that I decided to move to *[Winston](https://www.npmjs.com/package/winston)* and *[morgan](https://www.npmjs.com/package/morgan)*)
* Support for long quotes
* Explore a true bootstrapping process.
* Perhaps Vestaboards adopts the OAuth2 protocol? That would be a nice upgrade.
