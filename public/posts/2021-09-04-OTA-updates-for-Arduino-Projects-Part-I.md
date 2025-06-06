---
layout: post
title: "OTA Updates for Arduino Projects - Part I"
date:   2021-09-04
categories: arduino ota
comments: true
author: Eugenio Pace
---

Today I started researching options for "Over The Air" (OTA) updates for my Arduino based project. Until now whenever I need to update the sketch I simply connect the board to my computer, compile and upload using the Arduino IDE. It works well, but for a "real" project it would not be practical.

This is a well known problem so I started we are usually start: searching the web. I quickly found the [SDU library](https://www.arduino.cc/en/Reference/SDU) that allows updates to happen from an SD card. Which is pretty much exactly what I need, since my project has storage *and* WiFi. 

So I can have my sketch download a new version using the network, then store it in the card, reboot, and let the library do its magic. But if all worked, there would be no blog post. And here we are...

The main issue is that by default the library expects a specific SD reader configuration. The chip select pin is hard coded to *4*:

```C++
#ifndef SDCARD_SS_PIN
#define SDCARD_SS_PIN 4
#endif
```

If your board has an SD card device wired up differently (mine!), it won't work. In my project the SD card is built into the e-ink display, and pin 4 is used for the WiFi module. And switching them around is not an easy option.

Here's how you fix it:

1. Open the `SDUBoot.ino`. In a Mac it is under:
	* `/Users/{YOUR USER}/Library/Arduino15/packages/adafruit/hardware/samd/1.7.3/libraries/SDU/extras/SDUBoot`
2. Change the `SDCARD_SS_PIN` to whatever matches your board.
3. Install the `FlashStorage` library using the Library Manager in the IDE:

![](/media/ard-fs-lib.png)

4. Run the `build.sh` file on a terminal
5. Include `<sdu.h>` in your project. 
6. Voilá

Notice that by default the library checks for a file `UPDATE.BIN` (this is also defined on the `SDUBoot.ino` sketch), which you can customize too.

Of course anytime you update the board support files these changes will be overwritten. Thus this post as a reminder of what I need to do. Hope you also find it useful.

This is just the device side of things, in a future post I will cover the rest of the parts (which I have not built yet):

1. Create an API to check for updates.
2. Download and verify them.
3. The back end infrastructure for versions and keep track of installed versions.
4. The support in the sketch for calling the API regularly.

But I don't need any of this to test things out as you can export a compiled image from the IDE and simply copy it to the SD card, then reboot; the new version should run.
