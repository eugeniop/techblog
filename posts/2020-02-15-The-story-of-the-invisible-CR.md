---
layout: post
title: "The story of the invisible CR"
date:   2020-02-01
categories: arduino eink
comments: true
author: Eugenio Pace
---

While building my [Stoic Display](/post/2020-01-18-A-Display-of-Stoic-Quotes-using-Arduino-and-e-Paper-Display.md) I run into an issue that consumed me a lot of time. As it always happens with some bugs, in retrospect it was so obvious that it gets to the point of being embarrassing. All the clues were there in front of me, but I missed them all.

> One of the things I love the most about writing software is how humbling of an experience it is. _Software is an art that fights back_ I read a long time ago.


## The configuration system

For my project, I wanted to have a simple configuration system with some flexibility. Some parameters of the app need to change over time (e.g. WiFi settings), and I didn't want to have to recompile each time I changed locations.

My first abstraction was simply a function that would return a named parameter:

```c
const char * Config_Get(const char * name){
  //...
}
```

And in the first implementation, I simply returned hardcoded values. On a later iteration, I added methods for iterating on all parameters and setting their values. 

Once everything worked fine, I wrote the code to retrieve values from EEPROM. Only my board...doesn't have EEPROM. But it has LOTs of Flash memory (for the program). I found a [library](https://github.com/cmaglie/FlashStorage) that _emulates_ EEPROM on Flash. Looks neat, but then I realized that my board had an SD slot I had completely forgotten about it. Now I can store *GB* of data! 

SD is driven through the [SPI](https://www.arduino.cc/en/reference/SPI) which is a serial, _shared_  data bus: WiFi, and the Display itself use the same bus. All you need is a CS (Chip Select) I/O pin to indicate what device you are sending/receiving data from.

A little research into the pinout of my board, some basic test/example sketches later and I had all the building blocks I needed.

So I went ahead and wrote the implementation in the config system to retrieve and store text from a file in the SD. And naturally, it didn't work. In fact, _nothing_ worked. Once I integrated and enabled SD support WiFi stopped working. The question was "why?"

## FILE_WRITE is somewhat deceiving

My first attempt at *saving* configuration is really simple:

```c
int Config_Save(){
  if(!SD.begin(SD_CS)){
    Debug("Config. SD card initialization failed.");
    return 0;
  } else {
    Debug("Config. Attempting to save configuration to file");
    File configFile = SD.open(CONFIG_FILE, FILE_WRITE);
    configFile.seek(0); // Write from the beginning
    for(int x = 0; x < params_length; x++){
      configFile.println(values[x]);
    }
    configFile.close();
  }
  SD.end();
  return params_length;
}
```

Retrieval was (or seemed) also trivial:


```c
if(!SD.begin(SD_CS)){
    Debug("Config. SD card initialization failed. Falling back to default values.");
    CreateDefaultConfig();
    return;
  } else {
    Debug("Config. Attempting to read configuration from file");
    File configFile = SD.open(CONFIG_FILE, FILE_READ);
    if(configFile){
      Debug("Config. Found configuration file. Reading values");
      for(int x = 0; x < params_length; x++){
        String configData = configFile.readStringUntil('\n');
        configData.toCharArray(values[x], MAX_VALUE);
      }
      configFile.close();
      Debug("Config. Config values loaded");
    } else {
      Debug("Config. No configuration file found. Creating default one and saving.");
      CreateDefaultConfig();
      Config_Save();
    }
  }
```

This first issue is that `FILE-WRITE` in `SD.open` is really a combination of flags that essentially renders `File.seek` a _no-op_. It took me a while to realize that I was always _appending_ to the file despite the `seek(0)`. So even though the save operation was successful, I was always reading the original values, as all updates were being appended.

This change made it all work as expected:

```c
File configFile = SD.open(CONFIG_FILE, O_RDWR | O_CREAT);
```

## The invisible CR

Having sorted that, things were still not working as expected. Specifically, WiFi stopped working altogether. A lot `Serial.println` later, I couldn't figure out what was going on. It was as if the network was not available. I suspected a conflict between the different SPI devices. After all, in isolation, each one worked fine. When I combined all together it didn't. Unfortunately for me, this is actually possible, and there's a bunch of results on potential SPI conflicts if you google around. 

> Arduino libraries now ship an `SPI.beginTransaction()` and `SPI.endTransaction()` functions to capture and restore the configuration state of a particular device that helps isolate the changes and potential issues. But all this seems applicable for lower-level libraries (like the `SD` library itself).

I decided to write a simple integration test:

```c
void setup(){
  //Initalize Config
  Config_Init();
  Config_Reset_To_Default();
  Config_Save();

  Serial.begin(115200);
  while(!Serial){}
  
  //1. Attempt Wifi using config settings
  char * ssid = Config_Get("WIFI_SSID");
  char * pwd = Config_Get("WIFI_PWD");

  Serial.println(ssid);
  Serial.println(pwd);
  
  Serial.println(getEpoch(ssid, pwd));
  delay(1000);

  //2. Attempt WiFi with no config settings
  Serial.println(getEpoch("The SSID", "The Password of this WiFi"));
  Serial.println("Done!");
}
```


The printed `ssid` and `pwd` looked exactly as the hardcoded values in step 2. Step 1 failed, Step 2 worked perfectly. WTF!

After a long stare at the code, I added a `strlen(ssid)` and it returned 9. 9!? The `SSID` I'm using was 8. I checked what was in the 9th character and the console printed `0D`. Voilá! A [CR](https://en.wikipedia.org/wiki/Carriage_return)

It turns out that `File.println` actually emits *both* a CR and a NL. And when I was reading the contents of the file, I used:

```c
 String configData = configFile.readStringUntil('\n');
```

So a (invisible) CR was being added. I replaced the `File.println` with:

```c
  configFile.print(values[x]);
  configFile.print("\n");
```

And everything worked just fine. Obvious, wasn't it?