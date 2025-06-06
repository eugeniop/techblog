---
layout: post
title:  "Building Secure Alexa Skills - Part III"
date:   2016-12-02
categories: alexa auth0
author: Eugenio Pace
comments: true
---

> Dec 27th, 2023 update: Webtasks have been deprecated.

> As of June 2022, some of these libraries are outdated/deprectaed (e.g. `request`)

A reader of this blog, [tjaffri](https://disqus.com/by/tjaffri/), raised two questions:

1. `refresh_tokens` did not work with Alexa (and Auth0).
2. How to generate `access_tokens` for testing.

### Refreshing **access_tokens** in Alexa

In my original prototype, I did not configure Alexa to request `refresh_tokens` so I didn't know for sure, but I assumed it would since all this is based on "standards" (OpenID Connect/OAuth2).

Naturally, it failed. The reason it failed was that Auth0 was not returning the `expires_in` attribute in the refresh response body. 

The token exchange endpoint is used for both `code` and `refresh` requests:

The difference between the two is is just the `grant_type` parameter in the body:

```
POST
https://{your tenant}.auth0.com/oauth/token
content-type: application/json
{ 
  "grant_type": "refresh_token",
  "client_id": "{CLIENT_ID}",
  "client_secret": "{CLIENT_SECRET}",
  "refresh_token": "{refresh_token}"
}
``` 

In a `code` exchange request, the response looks like this:

```js
{ 
  "access_token": "{THE ACCESS TOKEN}",
  "id_token": "{THE ID TOKEN}",
  "expires_in": 120
}
```

Alexa uses the `expires_in` value to decide whether a new token is required or not. 

> Notice that the `access_token` is generally an opaque thing. Only to be consumed and interpreted by the API. The fact that in Auth0's case it is actually a JWT (and therefore "decodable"), is not relevant. Alexa doesn't know how to extract that information. Thus the `expires_in` parameter.

The reason it didn't work is simple: a bug. Auth0 omitted the `expires_in` in the refresh response, and that broke Alexa (not entirely though, it just didn't refresh the token).

> `expires_in` is [technically RECOMMENDED](https://tools.ietf.org/html/rfc6749#section-4.2.2) not required. But it is required in Alexa. This of course is not super clear in the documentation.

A fix is now ready and the flow will work as expected once it is live sometime next week.

> Reminder: `refresh_token` is sent by Auth0 when you add the `offline_access` scope to the authorization request.

#### What to do in the meantime?

There's a workaround you can try if you cannot wait until the fix is in production. You can proxy the token exchange request. And here comes [Webtask](https://webtask.io) for the rescue:

The code would look like this:

```js
var Webtask = require('webtask-tools');
var request = require('request');
var app = new (require('express'))();

app.post('/token', function(req, res) {
  console.log(req.webtaskContext.data);
  
  var grant_type = req.webtaskContext.data.grant_type;
  var client_id = req.webtaskContext.data.client_id;
  var client_secret = req.webtaskContext.data.client_secret;
  var redirect_uri = req.webtaskContext.data.redirect_uri;
  
  var options = { 
                  method: 'POST',
                  url: 'https://{YOUR AUTH0 ACCOUNT}.auth0.com/oauth/token',
                  json: { 
                     'grant_type': grant_type,
                     'client_id': client_id,
                     'client_secret': client_secret,
                     'code': code,
                     'redirect_uri': redirect_uri
                  }
                };

  if(grant_type == 'authorization_code'){
      options.json.code = req.webtaskContext.data.code;
  } else {   
    if(grant_type == 'refresh_token')
    {
      options.json.refresh_token=req.webtaskContext.data.refresh_token;
    }
  }

  request(options, function(err, res, body) {
    console.log('Error', err);
    if(err) return res.sendStatus(500);
    if(options.json.refresh_token){  
      //Add the missing expires_in for refresh token flow
      body.expires_in = 120;
      res.json(body);
    }
  });
});

module.exports = Webtask.fromExpress(app);
```

Then in your Alexa configuration, you use the Webtask URL as the token exchange endpoint.

### Getting Test **access_tokens** for your API

This is an easy one. You just create a new **Client** (e.g. your test runner). Then you can use `client credentials` flow to obtain a token.

1. Register a new **Client** in Auth0 (you can specify "Non Interactive Client").
2. Then on the [API section](https://manage.auth0.com/#/apis), click on **Clients** and authorize it to request tokens with the scopes you need.
3. Use the `client credentials` flow to request a token for this API (with the given scopes).

```sh
curl --request POST \
  --url https://{YOUR AUTH0 ACCOUNT}.auth0.com/oauth/token \
  --header 'content-type: application/json' \
  --data '{"client_id":"{THE TEST CLIENT ID}","client_secret":"{THE TEST CLIENT SECRET}","audience":"https://whatshouldiwear","grant_type":"client_credentials"}'
``` 

Auth0 will send you back an `access_token` you can use with your test runner. When you are done, you can simply delete the **Client**. No changes will happen on the API or anything.

Merry Christmas **tjaffri**!

