---
layout: post
title:  "Building a simple data capturing device - Part I"
date:   2016-11-26
categories: mbed iot
comments: true
author: Eugenio Pace
---

I'm building a simple data capture device for our family farm. I've experimented with a few devices before, but I've had trouble with both their usability and reliability.

General purpose data capture devices offer flexibility, but are very expensive, and because they are "general purpose", it requires quite some effort to fully customize. They don't provide all the peripherals I need either (e.g. RFID), so I ended up with some terrible hacking (and lots of glue)

Some more specialized readers are horrendous in UX. Their displays are awful, not localizable. Keyboards are fixed and require too much training.

So, naturally, I set out to build one.

## Key requirements

1. Read **134Khz RFID**.
2. Capable of **storing** ~1000 records of about 30 bytes each with two fields: `RFID` and `Tag`.
3. Able to capture weight (in kilograms) and assign it to a cow.
4. Able to capture milk production (in liters) and assign it to a cow.
5. Assign an RFID to a cow.
6. It must be robust enough to survive a dairy farm (hint: lots of water-y stuff around, extreme temperatures, rough handling)
7. Have enough storage for the above, before requiring the below.
7. The device should periodically synchronize the captured information with a back-end app running in the cloud.

## How are cows identified?

Cows in the farm are identified both with an RFID (injected under the skin), and a visual numeric tag that is attached to their ears:

![](/media/cow-tag.png)

## Basic hardware

### CPU

The core board for this project is the mbed platform. More specifically the [LPC1768 baord](https://developer.mbed.org/platforms/mbed-LPC1768/).

![](/media/mbed.png)

It is compact, low power, has tons of built-in ports and peripherals, and quite a bit of on-board memory (512K flash). And it is a joy to work with.

### Keyboard

I just need numeric keys, plus a few functions. I could build the keyboard from scratch, but this [Adafruit keyboard](https://learn.adafruit.com/adafruit-trellis-diy-open-source-led-keypad/overview) is awesome. And I can have colored backlights for free.

![](/media/adafruit-trellis.png)

I also like the fact that you can chain then and big larger keyboards if needed (I'm not planning to).

Since I have a 2 line LCD display, I figured I would include an **Up** and **Down** keys, to scroll over menus. A **Delete** key and an **Enter**.

The reminder buttons are 10 digits and a **.** for decimals (not really needed).

### Display

I don't need much for this device. I'd like to save as much power as possible, so I'm going with a [cheap 16x2 LCD display from Sparkfun]().

![](/media/lcd.png)

This device is very simple to use, and because the information to display is not complex, I see this as a good start. It is also low power, and works very well in very bright areas (hint: lots of sun in the fields). 

This particular model uses a parallel port. But I have enough of those, so it should be fine.

### RFID reader

I did quite a bit of research on this one. Eventually, I found a company in Australia, [Priority 1 Design](http://www.priority1design.com.au/shopfront/index.php?main_page=product_info&products_id=18&zenid=galhvnekb48tsjd0d6alcfpgb1), building low power, simple to use RFID readers in the frequency I need (134Khz). 

![](/media/rfid.png)

The interface is simple: async serial with TTL levels. It accepts simple ASCII commands to start reading, etc.

### Storage & Records

The **mbed** platform comes with 512KB of flash memory. That should be plenty. 

My storage needs are:

* Storing **1000 records** for `tags` & `RFIDs`. Each record looks like this:

```
990_000000105829:1234
990_000000106543:4567 
...
```
The format for this file is `{RFID}:{tag}`. The intent for this is to be able to identify a cow with a given RFID.

That is ~ 20-25 bytes / record. I'd be needing 25K for this reference data.

> There are fewer than 1000 cows, and not all of them have RFIDs, so this would be fine.

* Storing **data captures**. Every event captured needs to be stored in the device so it can be sent later to a backend.

I opted for a very simple record structure:

```
W:1234:100.5:1480195449230
W:1234:150.8:1480195449230
P:1234:24:1480195449230
...

```

This format means:

`{event type}:{tag}:{value}:{timestamp}`

So `W:1234:100.5:1480195449230` would mean, **Weight captured for cow with `tag=1234`. `Weight=100.5 Kilograms`, captured on `2016-11-26T21:24:09.230Z`**

* **P** means liters of milk production.
* **W** means weight in kilograms.

With records ~30bytes, and having ~490KB of storage available, I have ~16K records. That's plenty, since I'm planning on having frequent synchronizations with the back end.

> This reminds me, we might need an RTC module. Not sure exactly how much battery the mbed board would consume just for keeping track of time.

### Communications / Synching

I debated about adding a WiFi module, or enabling the Ethernet port (that comes built in the board). I decided against eventually, mostly because: 

1. I don't want to go through the hassle of setting up WiFi on the device.
2. Even worse, I don't want to go through the hassle of programming TLS on the device itself (with all the additional complexity of managing credentials, etc.)
3. I have a perfectly fine USB port available.
4. The MBED board will show up on a host computer as a drive.
5. I can simply write a host program that reads a file, and POSTs to an API. 
6. Simplicity wins.

### Power

For the time being, I'll just plug this to the host computer. Later on, I'll figure out some good battery to power all this (and recharge it).

## Overall design

![](https://docs.google.com/drawings/d/e/2PACX-1vRVzVeWt4skrmLk0DzHUWDUI66LismuURn54U3E2bD8OZwQolcblL4BEFqGUPi9jGwA5uxqpywBItAA/pub?w=797&h=527)


Now the hard part starts...coding the app.
