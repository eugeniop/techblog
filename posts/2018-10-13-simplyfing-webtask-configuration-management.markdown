---
layout: post
title:  "Simplyfing Webtask Configuration Management"
date:   2018-10-13
categories:
comments: true
author: Eugenio Pace
---

> Dec 27th, 2023 update: Webtasks have been deprecated.

I have many little apps all implemented as [Webtasks](https://webtask.io). I've shown many of these in previous posts such as:

1. [Controlling NEST thermostats & cameras](/post/2017-11-25-controlling-a-nest-thermostat-with-sms.markdown)
2. [Sending SMS messages via twilio](/post/2017-07-15-using-twilio-and-webtask-to-become-a-better-stoic.markdown)
3. [Bulding Alexa's skills](/post/2016-11-09-Alexa-Auth0.markdown)

In some cases, a single app is made up of a couple of different Webtasks. Very often when there're many, it'd be a combination of an *interactive* and a *batch* one (the former being an [Express based WT](https://webtask.io/docs/editor/templates), the latter a simple [cron](https://webtask.io/docs/cron)).

One issue I was having is keeping configuration in synch across all. Because these are simple apps with shared backends (e.g. they all use the same MongoDB for storage or the same Twilio account for messaging), I found myself copy-pasting configuration values across all Webtasks using the [built-in secrets capability](https://webtask.io/docs/editor/secrets). 

These values don't change very often, but when they do, it is a royal PIA to update them all. So I came with a simpler method. 

![](https://docs.google.com/drawings/d/e/2PACX-1vTQ0CGlHHFq8i42FzvroksFGbLlXbWTbumqb09rVkeNzigtu_CwxzYmORtOHpj6dzPfZ-cQoG28phYE/pub?w=571&h=326)

### A *Configuration* Webtask

This is 20 lines of code Express Webtask:

```js
'use latest';
import express from 'express';
import Webtask from 'webtask-tools';
import bodyParser from 'body-parser';
const app = express();

app.use(bodyParser.json());

app.get('/', function (req, res) {

  var auth = req.get('Authorization');

  if(!auth || auth !== req.webtaskContext.data['CONFIG_API_TOKEN']){
    res.statusCode = 403;
    return res.send("Unauthorized");
  }

  res.json(req.webtaskContext.data);
});

module.exports = Webtask.fromExpress(app);
```

All it does is send back a JSON object with all secrets (provided the `access_token` is valid)

### Using the *Configuration* WT

All my Express APIs/mini-Websites now include the following middleware:

```js
var config;

server.use((req, res, next) => {
    if(config){
      return next();
    }
    request.get('https://{MY WEBTASK URL}/config',
                {
                  headers: {
                    Authorization: req.webtaskContext.data['CONFIG_API_KEY']
                  }
                },
                (r, s, b) => {
                  if(s.statusCode !== 200){ return next('Cannot load configuration');}
                  config = JSON.parse(b);
                  next();
                });
});
```

Because it runs first, `config` is always populated. Now anywhere in code I can do:

```js
server.get('/test', (req, res, next) => {
  const { MONGO_URL, GOOGLE_TRANSLATE_API_KEY } = config; 
  ...

    do something here with the config values ^

  ...
});
```

Now the only secret I need to keep in each individual WTs is CONFIG_API_KEY, which happens to be the `access_token` for the configuration API.
