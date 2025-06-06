---
layout: post
title: "To Proxy Or Not"
date:   2021-06-19
categories: arduino
comments: true
author: Eugenio Pace
---

SSL / TLS support on small footprint Arduino boards like the Adafruit M0 has been somewhat tricky, with missing documentation, rather poor troubleshooting, or both. Perhaps it is just that I have limited knowledge of all the various versions, variations and flavours of TLS/signing algorithms, etc.

Recently [Auth0 deprecated TLS 1.0 and TLS 1.1](https://auth0.com/docs/product-lifecycle/deprecations-and-migrations#legacy-tls-deprecation), which meant my project stopped working.

I spent some time trying to figure out how to upgrade the firmware in my board to support TLS 1.2. It looks like in [TLS1.2 support was added to the firmware quite some time ago](https://blog.adafruit.com/2016/05/31/atwinc1500-with-firmware-19-4-4-has-tls-1-2-client-support-iot-iotuesday-atmel/), but even after upgrading to `19.6.x` communications to `auth0.com` endpoints continued to fail.

It is hard to say for sure that it is related to this, because the library (WiFi101) does not provide much information. 

Here's what works and what doesn't:

1. WiFi starts.
2. NTP works (used to sync the internal clock).
3. Communications to the application's backend (hosted in *Heroku*) works.
4. All interactions to `auth0.com` fail with no logs.

I've tried using the wonderful `https://www.howsmyssl.com/a/check` but that failed too. I updated the `howsmyssl.com` certificate using the FirmwareUploader sketch. I have no clue why it fails to connect. After some googling around, I found a few reports on cipher incompatibilities, and a myriad of other issues.

I exhausted my time-box for this, so being pragmatic, I switched to another solution. Since my *Heroku* hosted API worked just fine, I decided to proxy all authentication calls through it.

```js
function proxyHandler(url){
  return function(req, res, next){
    console.log(req.body);
    const options = { 
                      method: 'POST',
                      url: url,
                      headers: { 'content-type': 'application/json' },
                      data:  req.body,
                      params: req.query
                    };
    axios(options)
      .then(response => {
        res.send(response.data);
      })
      .catch(err => {
        if(err.response){
          res.statusCode = err.response.status; 
          return res.send(err.response.data);
        } else {
          return next(boom.badRequest(err));  
        }
      });
  }
}

//Endpoint used to start the device flow process
server.post('/oauth/device/code', proxyHandler('https://MYAPP.auth0.com/oauth/device/code'));

//Token endpoint used for refresh
server.post('/oauth/token', proxyHandler('https://MYAPP.auth0.com/oauth/token'));
``` 

And it works like a charm. A nice side effect is that now I only need to maintain just one certificate on the board (Heroku's). 

I am sure this weakens the overall network security a little bit, presumably because the TLS ciphers used in Heroku are not as strong as Auth0's, but I'm not 100% sure. Perhaps an OpenSSL expert out there can shed some light. 

Of course the security requirements of this app are very modest, but if this were a production "real" app, I'd be more cautious. So, the usual _caveat emptor_: use at your own risk.
