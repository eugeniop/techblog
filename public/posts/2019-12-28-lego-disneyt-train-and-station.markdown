---
layout: post
title: "Lego Disney Train And Station"
date:   2019-12-28
categories: trains lego
comments: true
author: Eugenio Pace
---

A family tradition for christmas / end of the year is to build a large Lego set as a team. This year, I surprised everyone with the [Lego Disney Train and Station](https://www.lego.com/en-us/product/disney-train-and-station-71044). It is a cool, very detailed set.

Also, the train is powered, and comes with a (new?) Bluetooth controller. You can install an app on your iPhone or Android and then use it to control the train. Basically, speed and direction.

We had a lot of fun for many days building the wholem thing collaboratively. And then I thought: BLE, iPhone app ... would it be cool to program that?

A little googling and I found a [library for Arduino BLE](https://github.com/corneliusmunz/legoino). I've got an awesome [Nano33](https://store.arduino.cc/usa/nano-33-iot) some time ago, but then I read a little bit more and found an even easier way with Nathan Kellenicki's [awesome nodejs library](https://github.com/nathankellenicki/node-poweredup).

> More info on Lego controllers on [this post ](https://nathan.kellenicki.com/posts/2018/09/25/introducing-node-poweredup/) from the same author.

And here's my modified _"hello train"_:

```js
const PoweredUP = require("node-poweredup");
const poweredUP = new PoweredUP.PoweredUP();

const { log } = console;

poweredUP.on("discover", async (hub) => { // Wait to discover a Hub
    log(`Discovered ${hub.name}!`);
    await hub.connect(); // Connect to the Hub
    log("Connected");
    
    await hub.sleep(3000); // Sleep for 3 seconds before starting

    log("MAC Address:" + hub.primaryMACAddress);
    log("Firmware: " + hub.firmwareVersion);
    log("Hardware: " + hub.hardwareVersion);

    await hub.setMotorSpeed("A", 50);
});

poweredUP.scan(); // Start scanning for Hubs
console.log("Scanning for Hubs...");  
```

Which opens up an entire world of exciting possibilities. 

### Lego's protocol

For those interested in the internals, [Lego has open sourced their protocols](https://github.com/LEGO/lego-ble-wireless-protocol-docs)
