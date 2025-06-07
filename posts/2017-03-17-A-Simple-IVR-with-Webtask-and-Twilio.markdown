---
layout: post
title:  "A Simple IVR with Webtask and Twilio"
date:   2017-03-17
categories: voice
comments: true
author: Eugenio Pace
---

> Dec 27th, 2023 update: Webtasks have been deprecated.

After building the sample in [the previous post](/post/2017-03-12-Securing-IVR-with-Auth0.markdown}) I got curious about a similar implementation with [Twilio](https://twilio.com).

It took me abut 30 min to have this up and running. I bet you can do it faster.

## 1. Create an Account in Twilio

First, go ahead and [sign up](https://www.twilio.com/try-twilio) for account (free). 

You will need to create a **[TwiML app](https://www.twilio.com/console/voice/dev-tools/twiml-apps)**, which is under **Tools / TwiML Apps**. 

![](/media/twilio-console.png)

The one important thing here is the **Voice Request URL**. This is the endpoint Twilio will POST to to initiate interactions. And this would map to one of the routes in the Webtask as described below. So keep reading.

## 2. IVR Code

For the IVR code, I mostly copy-pasted the [IVR Phone Tree tutorial](https://www.twilio.com/docs/tutorials/walkthrough/ivr-phone-tree/node/express). I just minimally tweaked it to make it as simple as possible (e.g. I don't need the logging, etc.)

So I just fired up [the awesome Webtask Editor](https://webtask.io/make) and pasted this:

```js

var express    = require('express');
var Webtask    = require('webtask-tools');
var bodyParser = require('body-parser');
var twilio = require('twilio');

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.post('/ivr/welcome', twilio.webhook({validate: false}), function (req, res) {
  console.log("Welcome", req.body);
  var twiml = new twilio.TwimlResponse();
    twiml.gather({
        action: "/twilio-ivr/ivr/menu",
        numDigits: "1",
        method: "POST"
    }, function (node) {
        node.play("http://howtodocs.s3.amazonaws.com/et-phone.mp3", {loop: 3});
    });
    res.send(twiml);
});

app.post('/ivr/menu', twilio.webhook({validate: false}), function (req, res) {
    console.log("Menu", req.body);
    var selectedOption = req.body.Digits;
    var optionActions = {
        "1": giveExtractionPointInstructions,
        "2": listPlanets
    };

    if (optionActions[selectedOption]) {
        var twiml = new twilio.TwimlResponse();
        optionActions[selectedOption](twiml);
        return res.send(twiml);
    }
    res.send(redirectWelcome());
});

app.post('/ivr/planets', twilio.webhook({validate: false}), function (req, res) {
    console.log("Planets", req.body);
    var selectedOption = req.body.Digits;
    var optionActions = {
        "2": "+12024173378",
        "3": "+12027336386",
        "4": "+12027336637"
    };

    if (optionActions[selectedOption]) {
        var twiml = new twilio.TwimlResponse();
        twiml.dial(optionActions[selectedOption]);
        return res.send(twiml);
    }
    res.send(redirectWelcome());
});

var giveExtractionPointInstructions = function (twiml) {
    twiml.say("To get to your extraction point, get on your bike and go down " +
        "the street. Then Left down an alley. Avoid the police cars. Turn left " +
        "into an unfinished housing development. Fly over the roadblock. Go " +
        "passed the moon. Soon after you will see your mother ship.",
        {voice: "alice", language: "en-GB"});

    twiml.say("Thank you for calling the ET Phone Home Service - the " +
        "adventurous alien's first choice in intergalactic travel");

    twiml.hangup();
    return twiml;
};

var listPlanets = function (twiml) {
    twiml.gather({
        action: "/twilio-ivr/ivr/planets",
        numDigits: "1",
        method: "POST"
    }, function (node) {
        node.say("To call the planet Broh doe As O G, press 2. To call the planet " +
            "DuhGo bah, press 3. To call an oober asteroid to your location, press 4. To " +
            "go back to the main menu, press the star key ",
            {voice: "alice", language: "en-GB", loop: 3});
    });
    return twiml;
};

var redirectWelcome = function () {
    var twiml = new twilio.TwimlResponse();
    twiml.say("Returning to the main menu", {voice: "alice", language: "en-GB"});
    twiml.redirect("/twilio-ivr/ivr/welcome");
    return twiml;
};


module.exports = Webtask.fromExpress(app);

```
Hit save and you are done. All that is left is copying the URL back on Twilio's console. This would be something like this:

```
https://{WEBTASK BASE URL}/{Webtask name}/ivr/welcome
```

## 3. Testing

Click on the **call** button. Magic!

![](/media/twilio-console-test.png)