---
layout: post
title:  "Using Webtask for a custom Passwordless connection in Auth0"
date:   2017-01-14
categories: express auth0 api
comments: true
author: Eugenio Pace
---

> Dec 27th, 2023 update: Webtasks have been deprecated.

The default SMS passwordless connection in Auth0 uses [Twilio](http://www.twilio.com) as the transport. 

The UI on the [Auth0 Dashboard](https://manage.auth0.com) makes it trivial to setup SMS based Passwordless if you have a Twilio account:

![](/media/passwordless-twilio.png)

But what if you don't want to, or can't use Twilio? Worry not! One of the great properties in Auth0 is extensibility. This behavior can be overridden, and you can plug **any** API to deliver a **[Time based One Time Password](https://en.wikipedia.org/wiki/Time-based_One-time_Password_Algorithm)** through whatever mechanism you want.

> **Passwordless** is not exactly accurate to describe this type of authentication. There is a Passsword in Passwordless, only it is an ephemeral one, and the user doesn't need to remember it.

The details of how it works are [documented in this article](https://auth0.com/docs/connections/passwordless/sms-gateway).

And once again, what else could be more convenient than a simple Webtask to act as the go-between your Auth0 account and your transport of choice.

> This is another practical example of [Webtask as a light-weight API gateway](/post/2017-01-01-Webtask-as-api-gateway.markdown). 

### 1. Create the API on Webtask

The first step is creating a Webtask. For this, I used [Webtask Editor](https://webtask.io/make), the amazing online code editor.

The simplest possible implementation is one that does nothing:

```js
'use latest';
import bodyParser from 'body-parser';
import express from 'express';
import Webtask from 'webtask-tools';

const server = express();

server.use(bodyParser.json());

server.post('/', (req, res, next) => {
  console.log(req.body);
  res.statusCode = 200;
  res.end();
});

module.exports = Webtask.fromExpress(server);
```

Here I do two things:

1. Print the output to the `console`. Remember Webtask ships with real-time logging so you can immediately see the output.
2. Return `200`, so Auth0 knows that "delivery" was successful.

You can try experimenting later by changing the `statusCode` to `401` or `500` and see what you get when you request the code.

Saving the Webtask means it is automagically deployed and ready to use. I copied the URL for the next step.

> The Webtask URL will look like `https://{YOUR ACCOUNT}.run.webtask.io/{NAME OF THE WT}`

### 2. Configuring a Custom SMS Passwordless connection

Custom Passwordless connections can be created in Auth0 through the management API. Perhaps the simplest is to use the [API Explorer](https://auth0.com/docs/api/management/v2#!/Connections/post_connections).

I POST'ed this payload: 

```json
{
  "options": {
    "disable_signup": false,
    "name": "sms-custom-wt",
    "strategy": "sms",
    "provider": "sms_gateway",
    "gateway_url": "https://{WT Account}.run.webtask.io/{WT NAME}",
    "from": "+11111111111",
    "syntax": "md_with_macros",
    "template": "Your one time password is > @@password@@",
    "totp": {
      "time_step": 300,
      "length": 6
    },
    "brute_force_protection": true
  },
  "enabled_clients": [
    "2j6ifm......L7pT",
    "68tirH......iHVC"
  ]
}   
```

The key parameters here are:

* `strategy`, that must be `sms`.
* `provider`, that must be `sms_gateway`.
* `gateway_url` is the URL where the request is posted to (the Webtask)


The other parameters are standard (and pretty self-explanatory).

### 3. Starting a Passwordless authentication request

Now, I can start the auth request. Auth0 offers a few options, depending on the app you are building. 

The simplest though is to use the [API explorer](https://auth0.com/docs/api/authentication#get-code-or-link).

It gives me pre-populated `curl` commands I can simply paste and run.

```sh
curl --request POST \
  --url 'https://{YOUR AUTH0 ACCOUNT}.auth0.com/passwordless/start' \
  --header 'content-type: application/json' \
  --data '{"client_id":"FEL........rRFH", "connection":"sms-custom-wt", "phone_number":"+12223334444", "send":"code", "authParams":{"scope": "openid","state": "YOUR_STATE"}}'

```

If successful, you should see two outputs:

The result of the `curl` command:

```js
{
  "_id":"587935d398420f9a11c0c708",
  "phone_number":"+12223334444",
  "request_language":null,
  "phone_verified":false
}
```

And the output on the Webtask console:

```sh
12:17:22 PM: new webtask request 1484338641999.785127
12:17:23 PM: { recipient: '+12223334444',
  body: 'Your code is > 326162',
  sender: '+11111111' }
```

Now I use the `Resource Owner` endpoint to complete the transaction:

```sh
curl --request POST \
  --url 'https://{YOUR AUTH0 ACCOUNT}.auth0.com/oauth/ro' \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --data '{ "client_id": "FEL......rRFH", "connection": "sms-custom-wt", "grant_type": "password", "username": "+12223334444", "password": "326162", "scope": "openid", "device": "My Phone" }'
```

with a response that looks like:

```json
{
  "id_token":"eyJ0e....YxpXuLkb9lUss",
  "access_token":"sbeG7stMhr9TBHzr",
  "token_type":"bearer"
}
```
Voila!

### 4. Plugging in a real SMS provider

Now that all is set, I can edit the Webtask to plug it in into a real SMS provider.

I have experimented with [Clickatell](https://www.clickatell.com), a provider I used in the past for SMS delivery in South America. But anything with an API is easy to connect to.


```js
'use latest';
import bodyParser from 'body-parser';
import express from 'express';
import Webtask from 'webtask-tools';
import request from 'request';

const server = express();

server.use(bodyParser.json());

server.post('/', (req, res, next) => {

 request.post('https://api.clickatell.com/http/sendmsg',{
    qs: {
      "from": req.body.sender,
      "user": req.webtaskContext.data.SMS_USERNAME,
      "password": req.webtaskContext.data.SMS_PASSWORD, 
      "api_id": req.webtaskContext.data.SMS_API_ID,
      "to": req.body.recipient,
      "text": req.body.body
    },
    headers: {
      'user-agent': 'Auth0 - Passwordless',
    }
  }, (e,s,b) => {
      if(e) return next(e);
      if(s.statusCode != 200) return next(new Error('Send SMS - request failed: ' + s.statusCode));
      if(b.indexOf("ERR") === 0) return next(new Error('Send SMS failed: ' + b));
      res.statusCode = 200;
      res.end();
  });
});

module.exports = Webtask.fromExpress(server);
```

> As I was writing this post, I noticed that Clickatell has updated their docs and API. The code above is taken from an app I wrote a couple years ago. It might not work anymore...

#### Other regional providers with an API

* [Plivo](https://www.plivo.com/docs/api/), Colombia

> Know of one not listed here? Let me know! 

### 5. Don't do this!

For those of you that are paying attention, you will notice that the Webtask above is not secured in any way. **Don't do this**.

Auth0 allows you to configure [authenticated requests](https://auth0.com/docs/connections/passwordless/sms-gateway#configure-an-authenticated-sms-gateway). With this option, Auth0 will add a token to the request that you can check on your API.

Why not make the above mandatory? There are a few cases where auth can be skipped. One (the only one?) of them is a Telco company that deploys Auth0 on their datacenter, and use network level security (e.g. IP restrictions). One could argue that even this is not acceptable, and API security should be enabled always.


