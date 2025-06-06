---
layout: post
title: "Surprises with MFA and Device Flow"
date:   2021-04-04
categories: sms otp
comments: true
author: Eugenio Pace
---

As I was experimenting with the [SMS Broadcaster](/post/2021-03-29-A-Broadcaster-For-SMS-MFA-Challenges.md), [one of my projects](/post/2020-01-18-A-Display-of-Stoic-Quotes-using-Arduino-and-e-Paper-Display.md) stopped working suddenly.

I haven't made any changes in months, and it has been reliably working so it was a little bit surprising.

It turns out that the device uses `refresh_token` to renew `access_tokens` to call the backend API. I didn't realize that the refresh token request is affected by MFA settings (I should know better, shouldn't I? But alas...).

When I turned on MFA in my Auth0 account I did it for *EVERYTHING* using Rules:

```js
function multifactorAuthentication(user, context, callback) {
  context.multifactor = {
    provider: 'any',
    allowRememberBrowser: false
  };
  callback(null, user, context);
}
```

With this, all requests would be challenged. My Arduino code did not take that condition into account and would simply try to renew the token _ad aeternum_.

The message you get back when this happens is something like this:

```js
403
{
  "error": "mfa_required",
  "error_description": "Multifactor authentication required",
  "mfa_token": "e26.2*272dc2*02f..........."
}
```

Of course, rules allow you to tweak when MFA as required. In my case, I wanted to exclude this particular device on refresh (but not on the initial authentication), so I rewrote the rule to:

```js
function multifactorAuthentication(user, context, callback) {

  //If it is a device of type=display & it is a refresh, skip MFA
  if(context.clientMetadata && 
     context.clientMetadata.device_type && 
     context.clientMetadata.device_type ==='display' &&
     context.protocol === 'oauth2-refresh-token'){
    return callback(null, user, context);
  }
  
  context.multifactor = {
    provider: 'any',
    allowRememberBrowser: false
  };
  
  callback(null, user, context);
}
```

I am using the `clientMetadata` object with is an arbitrary payload you can associate to a "app" (in this case my display). In this case, I am using a property `device_type = display`.

Now my display is back inspiring me every day, and the quote that I've got was:

>It takes the whole of life to learn how to live, and-what will perhaps make you wonder more-it takes the whole of life to learn how to die. - Seneca

It is important to highlight that if you configure MFA with a _Policy_ instead of rules, then refresh_token requests are automatically excluded. Rules directives take precedence over a policy.

