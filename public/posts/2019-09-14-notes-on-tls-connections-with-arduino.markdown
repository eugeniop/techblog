---
layout: post
title: "Notes on TLS connections with Arduino"
date:   2019-09-14
categories: arduino TLS SSL
comments: true
author: Eugenio Pace
---

## TL;DR

If you need TLS1.2 *and SNI* support in your Arduino project you must use firmware *+1.2.3* which is available in the [hourly build](https://www.arduino.cc/en/Main/Software#hourly) of the Arduino IDE. I'm using IDE version *1.8.9* and firmware *1.2.4*.

Many thanks to [Luca Cipriani](https://twitter.com/mastrolinux) and [Sandeep Mistry](https://github.com/sandeepmistry) for helping me troubleshoot this.

## Making TLS work on Arduino MKR 1010

I'm sitting on a long flight across the North Atlantic Ocean. We will soon be flying over Greenland, which remains vast, white and Danish-ish, and I have the blessing of time to write.

I recently got an [Arduino MKR1010 board](https://store.arduino.cc/usa/mkr-wifi-1010), which is an incredible piece of hardware. So much power in such a small form factor. The board comes with strong support for HTTPs, including the [ECC508 crypto co-processor](http://ww1.microchip.com/downloads/en/DeviceDoc/20005927A.pdf) that helps with all algorithms required for, guess what, ... crypto. Amazing chip.

This allows the board to provide robust validation for certificates and trust chains, which makes it an ideal candidate for security concerned apps.

I wrote a simple app that demonstrates the new [OAuth 2.0 Device Authorization Grant](https://tools.ietf.org/html/draft-ietf-oauth-device-flow-15) we support in Auth0, so I set up my IDE for this board, made a few adjustments to the app and naturally ...it didn't work.

### Anatomy of HTTPRequest

I wrote 2 classes to help abstract `HTTPRequest` (and corresponding `HTTPResponse`) in Arduino. Both follow the principle of _"write the simplest thing possible"_, so they are quite frugal _by design_.

Basic usage is like this:

```c++
HTTPRequest req;

HTTPResponse * res = req.GetJSON(F("server.someplace.com"), "/api/resource", 443);
      
res.Debug();
     
if(res.statusCode != 200){
  //some error
  Debug(F("Error"));
  return res.statusCode;
}
      
//Got something back.
DoSomething(res->data);
...
```

In all cases, the failure happened in the (private) `ConnectServer` function that in turn calls `WiFiSSLClient.connect`:

```c++
CONNECTION_STATUS ConnectServer(String server, int port){
  if(WiFi.status() != WL_CONNECTED){ 
    Debug(F("HTTP.Connect. No WiFi"));
    return NO_WIFI_CONNECTION; 
  }

  int retries = 3;
  while(retries--){
    Debug("Connecting to: " + server);
    Debug("Port: " + String(port));
    if(client.connect(server.c_str(), port)){
      Debug(F("Connected"));
      return CONNECTION_OK;  
    }
    Debug(String(F("HTTP. Connection to server failed: ")) + server);
    Debug(F("Trying again..."));
    delay(2000);
  }
  return CONNECTION_FAILED;
}
```

 WiFi succeded, but after 3 attempts on `client.connect(server.c_str(), port))` it would return with a failure.

### Troubleshooting the TLS connection

Many things can go wrong if `WiFiSSLClient.connect`, but the function doesn't return much information. WiFi was working fine, so went ahead and opened one of the samples included in the IDE:

![](/media/ssl-sketch.png)

Compiled, uploaded to the board and ... it worked just fine! That was very promising.

I replaced the URL for mine (that is the custom domain in my Auth0 account), and it failed.

> Auth0 conveniently makes a `test` endpoint available for basic troubleshooting: `https://{your auth0 domain}/testall`

#### Certificates

The first thing to validate is certificates. Arduino comes with a factory-installed cert for `https://arduino.cc`. The sample sketch connects to `https://www.google.com`. But likely both have the same root cert, that is used in the initial handshake of TLS. So I went ahead and added my own domain client cert using the `FirmwareUpdater` sketch and tool (included in the IDE), section 3:

![](/media/firm-updater.png)

![](/media/firm-updater-tool.png)

You can add your own custom certs there by simply adding the URL.

#### Firmware version

Since you are at it, this is a good time to update the firmware. The factory version was a couple of minor releases behind the latest in my case. Good to check anyway.

#### Still not working

With that done, I tried the connection again and ... it failed :-(.

There's not a lot of logging info available on the terminal, so I tried a different (equivalent) endpoint in Auth0: `{tenant}.auth0.com`. And this worked just fine! And this was my _eureka_. The problem is the *custom domain*.

Auth0 supports [custom domains](https://auth0.com/docs/custom-domains), meaning that you can map `{tenant}.auth0.com` to arbitrary URLs (e.g. `login.mydomain.com`)

#### SNI (Server Name Indication)

[SNI](https://en.wikipedia.org/wiki/Server_Name_Indication) is an extension in TLS that allows multiple certificates to be associated with the same IP address. Auth0 uses *Let's Encrypt* to generate a cert for a custom domain name, all of them served from the same servers as it is a multitenant service.

When using `{tenant}.auth0.com` it works fine because Auth0 uses a wildcard certificate and SNI is not required. But when you have a custom domain configured, Auth0 needs SNI.

#### Arduino supports SNI

The good news is that SNI is supported, only in a newer version of the firmware (>1.2.3). More details [here](https://github.com/arduino/nina-fw/commit/f8756c882b70d5699584e4ded09a22ec1546c881)

Upgrading to firmware 1.2.4 fixed all the issues!

Fortunately, both IDEs (stable and nightly builds can co-exist on the same machine, it is easy to switch between one and the other.

#### Version of TLS?

Auth0 uses TLS1.2 and has disabled all other versions of the protocol (including the older true "SSL" protocols) for security reasons.

This [API](https://www.howsmyssl.com/a/check) on `howsmyssl.com` is a great tool to give you more information on TLS support for a client. Another great resource for troubleshooting. Modifying the `WiFiSSLCLient` sample to get this information is trivial, and will ensure everything is ok. This was the output from my board:

```json
{
  "given_cipher_suites": [
    "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_DHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_ECDSA_WITH_AES_256_CCM",

   … bunch of others omitted for brevity...

    "TLS_ECDH_ECDSA_WITH_AES_128_CBC_SHA",
    "TLS_RSA_WITH_AES_128_CCM_8",
    "TLS_EMPTY_RENEGOTIATION_INFO_SCSV"
  ],
  "ephemeral_keys_supported": true,
  "session_ticket_supported": true,
  "tls_compression_supported": false,
  "unknown_cipher_suite_supported": false,
  "beast_vuln": false,
  "able_to_detect_n_minus_one_splitting": false,
  "insecure_cipher_suites": {},
  "tls_version": "TLS 1.2",
  "rating": "Probably Okay"
}
```

Seeing `"tls_version":"TLS 1.2"` is good news.
