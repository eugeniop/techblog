---
layout: post
title:  "Using Webtask as an API gateway"
date:   2017-01-01
categories: express auth0 api
comments: true
author: Eugenio Pace
---

> Dec 27th, 2023 update: Webtasks have been deprecated.

A very convenient use case for Webtask is as a proxy for other APIs. A Webtask can be super handy to build an API that can:

* *Adapt* different security models.
* *Bundle* in a single call many backend APIs.
* *Transform* data shapes as required by the consumer.
* *Optimize* calls by caching when possible.

Consider the example I used in the [Alexa Skill example I wrote about](/post/2016-11-09-Alexa-Auth0.markdown). Alexa calls an API to retrieve the Skill response document. That follows a very specific data schema that looks like this:

```js
{ 
  version: '1.0',
  response: { 
    outputSpeech: { 
      type: 'PlainText',
      text: 'Some text to respond' 
    },
    shouldEndSession: true 
  },
  sessionAttributes: {} 
}
```

To provide an answer of what to clothes to wear, the API might be calling a **Weather API**, and maybe your **Google Calendar API**. Depending on forecast and your activities in a day, your clothes will change.

![](https://docs.google.com/drawings/d/1H9m5zdfV5H1v3ft4zKWj6iA9NUgUUiAIumt_euSkxb4/pub?w=1026&h=506)

> Webtask is not an API gateway "product". This is more of a pattern than a fully featured product.

## Adapting security models

Alexa security model requires inspection of the request body, extracting an `access_token` from the `user` object in that request, and JWT verification.

> Notice that, as I mentioned before, Alexa doesn't send the `access_token` in the `Autorization` header.

A *Weather* API like [OpenWeatherMap](http://openweathermap.org/api) uses [API Keys](http://openweathermap.org/appid), and their requests look like:

```sh
curl -X GET -H "Content-Type: application/json" -H "Cache-Control: no-cache" "http://api.openweathermap.org/data/2.5/weather?id=2172797&APPID={YOUR API KEY}"  
```

API Keys are in essence secrets. Not generally a good idea to spread them out. If you revoke them, the you need to go to each client` and update them. 

Then **Google Calendar** uses regular OAuth2 (different from Alexa), as Google is its own Authorization Server.

We don't want the OpenWeather `API_KEY` or the Google `access_token` out in the wild. Fortunately, Webtask supports `secrets` natively. 

![](/media/wt-make-secrets.png)

## Bundling and Transformation

This is pretty obvious in this example. 

## Optimization

Turns out that **OpenWeatherMap** has some pretty strict limits. From their [docs](http://openweathermap.org/appid#work):

```
Do not send requests more than 1 time per 10 minutes from one device/one API key. Normally the weather is not changing so frequently.
```

And this absolutely makes sense. Caching a response for 1 hour or so makes total sense. Here we can leverage [Webtask Storage](https://webtask.io/docs/storage), a simple JSON store ideal for this use case.


