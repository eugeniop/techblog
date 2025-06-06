---
layout: post
title: "Exploring the Dexcom API"
date:   2021-08-14
categories: dexcom
comments: true
author: Eugenio Pace
---

Someone I know is using the Dexcom G6 CGM device (CGM = Continuous Glucose Monitoring). It is a pretty amazing device. It takes a glucose measurement every 5 min without requiring you to prick your finger and using strips. I'm told it is life changing for people who have diabetes and I can see why.

A little exploration led me to find their developer portal. I love when companies have a *developer.COMPANY.com* web site.

As I explored the [documentation](https://developer.dexcom.com/overview), I found that Dexcom uses OAuth2 as the protocol to authorize access, so I immediately started looking at ways to integrate it with Auth0.

Auth0 has support for connecting to generic OAuth2 authorization servers, all you need to provide is:

1. The login endpoint (where authentication starts).
2. The token exchange endpoint.
3. An implementation of a function to get a user profile (or a `user_id` at minimum).
4. Optional `headers` & `scope`

Dexcom doesn't have a `user profile` endpoint, but luckily, the `accessToken` that results from a successful login is actually a JWT, and decoding it is super easy. Among other things we can extract the `sub` property which identifies a user uniquely.


```js
function(accessToken, ctx, cb) {
    
    const token = require("jwt-decode")(accessToken);
    
    const profile = {
      id: token.sub,
    };
  
    cb(null, profile);
  }
```

This creates a unique `User` in Auth0. The `accessToken` is securely stored in the user profile. Dexcom also supports requesting `offline_access` as the scope, which results in _both_ an `accessToken` and a `refresh_token` to be issued. 

Your system can then use the [Auth0 Management API]() to retrieve these values and call the Dexcom API to access all sorts of interesting information.

To retrieve sensitive information from the user profile (like the IdP `access_token`), you need the scope `read:user_idp_tokens`.
