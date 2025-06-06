---
layout: post
title:  "Adding Hardware handshake in Thermal Printer"
date:   2023-11-18
categories: arduino
comments: true
author: Eugenio Pace
---

I've been struggling to get my thermal printer to print bitmaps correctly. More specifically QRCodes. 

I swear there was time that it did (circa 2019), but now it doesn't anymore. A lot happened in between: lots of libraries were updated, Arduino versions have changed, etc.

I suspected a buffer overrun was the root issue, because it kind of starts OK, and then it prints garbage.

As a test I added a `delay` before writing to the serial port, and (while painfully slow), it prints OK.

The timing logic in the library is somewhat funky, but then reading the code it looked like the library supported hardware handshake:

```c++

// Constructor
Adafruit_Thermal::Adafruit_Thermal(Stream *s, uint8_t dtr)
    : stream(s), dtrPin(dtr) {
  dtrEnabled = false;
}

```

Further research revealed ([here](https://learn.adafruit.com/mini-thermal-receipt-printer/hacking)):

> _It appears that some varieties of these thermal printers support hardware handshaking (e.g. firmware v2.64, 2.68). This is barely mentioned in the datasheet, and in fact there isn’t even a physical connection for this on the outside of the printer. A little surgery is in order..._


There's indeed no `DTR` connection in the printer itself:

![](/media/printer-pinout.png)

But the idea of a little surgery was appealing, and my printer's firmware is `2.68` so it was worth a try.

And _voilà_, there was the un-wired terminal:

![](/media/printer-pinout-2.png)

Some soldering and wiring later, I tried it out and all worked as expected and my QRCodes printed nicely again. A nice side effect is that the printer is much faster too.

All it is required in the code is changing the constructor to:

```c++
 auto printer = new Adafruit_Thermal(&Serial1, 4);
```

In this case, the printer is wired to the `Serial1` port and uses pin 4 for DTR.

Too bad, this particular printer model is now discontinued by Adafruit, but there are a few other options and all of them work with the same library. It would be great if QRCodes were a built in capability of these.