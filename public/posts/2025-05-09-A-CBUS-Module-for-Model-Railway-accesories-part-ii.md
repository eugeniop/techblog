---
layout: post
title:  "A CBUS Module for Model Railway Accessories – Part II: Software"
date:   2025-05-31
categories: cbus trains
comments: true
author: Eugenio Pace
---

In [Part I](/post/2025-05-02-A-CBUS-Module-for-Model-Railway-accesories.md), I described the hardware for a CBUS-enabled accessory module designed to animate a model railway brewery—with sound, lights, and motion.

In this post, I’ll go through the software that ties everything together.

---

## Goals

Let’s recap what the software needs to do:

- Respond to CBUS *ACON/ACOF* messages and activate outputs accordingly.
- Activate a relay to power motors and lights.
- Play audio clips from an SD card.
- Activate the same from local buttons, such as those on the edges of the layout.
- Ensure reliable behavior across power cycles and long sessions.
- Provide debug/log output for testing.

For Arduino based projects I also like implementing a simple command line interface to run various diagnostics tasks. Usually, this would normally be plugged to the computer serial port (or Serial over USB as it is more common for modern boards).

---

## High-Level Architecture

Here’s a rough breakdown of the architecture:

```mermaid
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
```

---

## CBUS

### CBUS interface

Implementing the CBUS interface is straightforward, as it is mainly an implementation over CAN. The [Adafruit_MCP2515 library]() takes care of all the low-level details. The module is purely a *consumer* of events, so all it needs to do is check for a new CAN packet. CBUS packets we are interested in are:

```c++
typedef struct {
	byte opcode;
	byte nodeNumberHigh;
	byte nodeNumberLow;
	byte eventNumberHigh;
	byte eventNumberLow;
	byte param1;
	byte param2;
	byte param3;
} __attribute__((packed)) CBUSPacket;
```

`opcode` we respond to will either be `ACON` (`0x90`) or `ACOF` (`0x91`). Everything else, we discard. The next 2 bytes are the 16 bits corresponding to the *Node Number* (where the event originates), and the other 2 encode the *Event Number*. CAN packets are max 8 bytes, so the 3 extra ones in the `CBUSPacket`  are just fillers. 

With this in mind, the `CBUS` class is very simple:

```c++
#ifndef CANBUS_H
#define CANBUS_H

#include <Adafruit_MCP2515.h>

#include "defaults.h"

#define CAN_INT 13
#define CAN_CS 12  

// CBUS opcodes
enum CBUS_OPC { NOOP = 0x00, ACON = 0x90, ACOF = 0x91 };

enum CBUSInit { CBUS_INIT_OK = 0, CBUS_INIT_FAIL };

typedef struct {
	byte opcode;
	byte nodeNumberHigh;
	byte nodeNumberLow;
	byte eventNumberHigh;
	byte eventNumberLow;
	byte param1;
	byte param2;
	byte param3;
} __attribute__((packed)) CBUSPacket;

class CBUS {

	Adafruit_MCP2515 mcp;	

public:
	CBUS() : mcp(CAN_CS) {
	};

	int init(){
		if(!mcp.begin(CAN_BAUDRATE)){
			return CBUS_INIT_FAIL;
		};

		return CBUS_INIT_OK;
	}

	char getEvent(int * nodeNumber, int * eventNumber){
		
		CBUSPacket packet;
		int id;
		int packetLength = mcp.parsePacket();
		*nodeNumber = *eventNumber = 0;


		trace.log("CBUS", "Rx packet:", packetLength);
		
		//No message
		if(packetLength == 0){
			trace.log("CBUS", "No message");
			return 0;
		};

		if(mcp.packetRtr()){
			trace.log("CBUS", "Message is RTR - Ignoring");
			return 0;
		}

		trace.logHex("CBUS", "Message received", (char *)&packet, sizeof(packet));

		id = mcp.packetId();
		
		mcp.readBytes((char *)&packet, packetLength <= sizeof(packet) ? packetLength : sizeof(packet));

		if(packet.opcode != ACOF && packet.opcode != ACON){
			trace.logHex("CBUS", "Opcode not supported: ", packet.opcode);
			return 0;
		};

		trace.log("CBUS", "Opcode: ", (packet.opcode == ACON ? "ACON" : "ACOF"));
		*nodeNumber = (packet.nodeNumberHigh << 8) | packet.nodeNumberLow;
		*eventNumber = (packet.eventNumberHigh << 8) | packet.eventNumberLow;
		trace.log("CBUS", "Node Number: ", *nodeNumber);
		trace.log("CBUS", "Event Number: ", *eventNumber);

		return packet.opcode;
	};
};

#endif
```

> As you will see later, the main loop calls `getEvent` repeatedly (polling), instead of using interrupts. I tried with interrupts, but I think there was some interference with other modules I couldn't figure out. Because the CPU is way faster than the CAN bus, I think the polling approach is good enough.


### CBUS Configuration

Because I wanted to be able to configure the module to respond to arbitrary events, and because I have plenty of storage available, I opted for encoding `event -> actions` mappings in a file (`CBCFG.TXT`) with the following (hopefully self-explanatory) format:

```sh
# Node Number the module will listen to
NN=128

# Relay Event number
RELAY_EN=3

# Sound Event numbers
# Event numbers map to an mp3 file, e.g. steam=8 means, 
# "when event number = 8, play steam.mp3"

001=4
002=5
003=7
steam=8
```

When the board boots, it first reads the file and stores this information in memory. Then, as events arrive, we just check if it matches any combination. In the example, any event coming with a *node number* (**NN**) different from `128` is ignored. If the *node number* is correct, and the *event number* is *3*, then we address the relay. Then we check if the event number match any sound tracks to play.

> CBUS has a multiple ways of bootstraping configuration, including one that puts the device in _"learning mode"_, much like universal remote controls. In our cause, I thought editing this file was straightforward so I opted out of this mode.

Also note that a single event can trigger *both* the relay and a specific sound track.


### The task manager

The module needs to periodically check for:

1. CBUS commands
2. Any key presses
3. Commands from the terminal

I could simply check for either in the main `loop` function, but I built [a simple scheduler I described some time ago](/post/2020-03-28-A-Very-Simple-Task-Scheduler-on-Arduino.md), that allows me to call functions on some predefined time. The thinking is that over time we might want to add some automated scheduling of actions _autonomously_ (e.g. turn on lights/play sound every 15 minutes). 

The implementation evolved over time and both simplified it, and made it a little bit more powerful.

In this case, these 2 actions run every second (which seems enough):

```c++
  dispatcher.add("CBUS", "Looks for CBUS Commands", &Actions::checkCBUSCommandAction, 1);
  dispatcher.add("KEYS", "Check for keys", &Actions::checkKeysAction, 1);
```

And the `checkCBUSCommandAction`:

```c++
void checkCBUSCommandAction(){
    int nodeNumber, eventNumber;
    auto cmd = cbus->getEvent(&nodeNumber, &eventNumber);

    if(!cmd){
      trace.log("Actions", "No command received");
      return;
    }

    if(nodeNumber != config->getNodeNumber()){
      trace.log("Actions", "Ignoring Event from Node: ", nodeNumber);
      return;
    }
    
    //Check if event number is mapped to the relay
    if(eventNumber == config->getRelayEventNumber()){
      if(cmd == ACON){
        trace.log("Actions", "Event for activation of relay received");
        relay->on();
        return;
      }

      if(cmd == ACOF){
        trace.log("Actions", "Event for deactivation of relay received");
        relay->off();
        return;
      }
    }

    //Check if event number is mapped to any audio file
    char * track = config->getAudioByEventNumber(eventNumber);
    if(track){
      if(cmd == ACON){
        trace.log("Actions", "Event for activation of audio received");
        audio->play(track);
        return;
      }
      if(cmd == ACOF){
        trace.log("Actions", "Event for deactivation of audio received");
        audio->stopPlaying();
        return;
      }
    }

    // The event comes from a recognized node, but it is not mapped to any action here
    trace.log("Actions", "Unmapped event: ", eventNumber);
    return;
  };
 ```

 All pretty straightforward and self-explanatory.


### The command line interface. 

While connected to a computer via the `Serial` interface (USB connection), we can monitor all logs (notice the `trace.log()` calls generously sprinkled throughout) and we can also issue commands. 

I implemented a bunch of utility commands to check various features of the board. Here are a few:

| Command  |  Description		|
|----------|--------------------|
|fs| File system command to list/delete/etc. files| 
|mem| Displays available memory|
|cbus| Prints CBUS configuration |
|audio| Lists audio files, plays them|
|relay| Turn relay on/off |


```sh
> cbus

Node number: 128
Relay event number: 3
Event [4] mapped to track [001]
Event [5] mapped to track [002]
Event [7] mapped to track [003]
Event [8] mapped to track [steam]
```

###
