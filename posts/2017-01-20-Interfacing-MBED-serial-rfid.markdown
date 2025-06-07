---
layout: post
title:  "Interfacing MBED with a serial RFID Reader"
date:   2017-01-20
categories: rfid mbed
comments: true
author: Eugenio Pace
---

The data capture unit I'm building will use a serial [RFID reader](http://www.priority1design.com.au/shopfront/index.php?main_page=product_info&products_id=18&zenid=galhvnekb48tsjd0d6alcfpgb1).

The protocol in the device is pretty straight forward, all ASCII commands.

> You can command this device from a terminal screen, provided you have an adapter for TTL/RS-232 levels, or buy the reader with the adapter built in, which they do.

## Electrical interface

If you buy the minimum reader, the interface is TTL. In some cases, you might want to adapt these to RS-232 standard levels.

From [Wikipedia](https://en.wikipedia.org/wiki/RS-232):

> The RS-232 standard defines the voltage levels that correspond to logical one and logical zero levels for the data transmission and the control signal lines. Valid signals are either in the range of +3 to +15 volts or the range −3 to −15 volts with respect to the "Common Ground" (GND) pin; consequently, the range between −3 to +3 volts is not a valid RS-232 level. 

TTL is 0-5V. I plan on interfacing this directly to MBED, so nothing but wires are required.

## Protocol

The device accepts a number of commands, but for this implementation I'll be using just 3:

* `VER`: returns the **version** of the reader firmware.
* `SRA`: turns **on** the RFID field to read tags.
* `SRD`: turns **off** the RFID field.

`VER` is a way of making sure the reader is connected and ready. If this command failed, I can assume the reader is off for some reason (cable broke, internal electronics are burnt, who knows...).

> All commands end with a `\r` character. Serial port uses 9600 bauds, 8 bits data, 1 stop, no parity.

So the first thing I'll do is send the command and read the response. When that happens I can notify the interested parties. 

I like having an **on/off** command mostly to save some juice and extend battery life as much as possible. I have not measured it, but turning off the radio field should save a few mA.

### Examples of commands requests/responses

```sh
-> VER\r
<- 210\r

-> SRA\r
<- OK\r

-> SRD\r
<- OK\r

-> FOO\r
<- ?1\r
```

`OK` means **command accepted**. `?x` (where `x` is a number) means error.

Once the RFID field is on, when a tag is successfully read, the reader will just simply send the code read (followed a `\r`). For example:

```sh
<- 999_000000704060\r
<- 999_000000704066\r
```

Every time that happens, we also want to notify the interested parties.

## The Listener & the Reader:

My first step was to define an interface for the `Listener`. Anybody interested in being notified by RFID events, simply implements this interface:

```c++
class Listener{
public:
    typedef void (Listener::*OnErrorCallback)(char e);
    typedef void (Listener::*OnReadyCallback)();
    typedef void (Listener::*OnRfidReadyCallback)(char * rfid);
    
    virtual ~Listener(){
    };
    
    virtual void OnError(char e) = 0;
    virtual void OnReady() = 0;
    virtual void OnRfidReady(char * rfid) = 0;
};
```

* `OnReady` is called when the reader is ready to go.
* `OnRfidReady` when a new tag is available.
* `OnError` when something bad happens. In this case we I simply relying the error code sent by the device.

Now, the base class that defines a generic reader (remember we want to mock this out for tests):

```c++
class RfidReader{     
protected:
    Listener * target;
    void (Listener::*onReady)();
    void (Listener::*onRfidReady)(char *rfid);
    void (Listener::*onError)(char error);

public:   
    virtual ~RfidReader(){
    };
    
    void Init(Listener * target, void (Listener::*OnReady)(), void (Listener::*OnRfidReady)(char *), void (Listener::*OnError)(char error)){
        this->target = target;
        this->onReady = OnReady;
        this->onRfidReady = OnRfidReady;
        this->onError = OnError;
    };
    
    virtual void Scan() = 0;
    virtual void StopScanning() = 0;
};
```

## The MockReader

```c++
class MockRfidReader : public RfidReader {
private:
    Ticker t;
    
    void RfidReadyToRead(){
        t.detach();
        if(target) {
            (this->target->*onRfidReady)("999_000111222333");
        }
    };

public:
    MockRfidReader(){
    };

    virtual void Scan(){
        if(target) {
            (this->target->*onReady)();
        }
        t.attach(this, &MockRfidReader::RfidReadyToRead, 0.5);
    };
    
    virtual void StopScanning(){
    };
};
```

Now I can write a simple test:

```c++

class RfidListener : public Listener{
    
public:
    char Rfid[30];
    
    virtual void OnReady(){
    };
    
    virtual void OnRfidReady(char * rfid){
        strcpy(Rfid,rfid);
    };
    
    virtual void OnError(char e){
    };
};

class Test_Rfid : public Test{
    
    char * rfid;
    RfidReader * reader;
    RfidListener * listener;
    
public:

    Test_Rfid(){
        listener = new RfidListener();
        reader = new MockRfidReader();
        reader->Init(listener,(Listener::OnReadyCallback)&RfidListener::OnReady,
                              (Listener::OnRfidReadyCallback)&RfidListener::OnRfidReady,
                              (Listener::OnErrorCallback)&RfidListener::OnError);
    }
    
    ~Test_Rfid(){
        delete reader;
        delete listener;
    }

    virtual void Run(){
        TestRfid();
    }    

    void TestRfid(){
        printf("Test RFID\r\n");  
        reader->Scan();
        wait(2.0);
        assert.AreEqual("999_000111222333", listener->Rfid);
    }
};
```

## The real implementation


```c++

#define MAX_RFID_RECORD 30

enum Rfid_Events { Timeout='T', Error='?', EoF='\r' }; 

class Rfid134Reader : public RfidReader
{
private:
    Serial * port;
    
    //Model
    char ErrorCode;
    char Data[MAX_RFID_RECORD];
    
    StateMachine<Rfid134Reader> parser;
    
    void OnCharReceived();

public:
    Rfid134Reader(Serial * port);
    
    virtual ~Rfid134Reader(){
    };
    
    virtual void Scan();
    virtual void StopScanning();
    
    EventActionResult Reset(char e);
    EventActionResult RfidReady(char e);
    EventActionResult Store(char e);
    EventActionResult Ready(char e);
    EventActionResult VersionInit(char e);
    EventActionResult Error(char e);
};
```

```c++
#include "rfid134.h"

typedef State<Rfid134Reader> STATE_RFIDREADER;

extern STATE_RFIDREADER Rfid_Init[];
extern STATE_RFIDREADER Rfid_Error[];
extern STATE_RFIDREADER Rfid_Error[];
extern STATE_RFIDREADER Rfid_Version[];
extern STATE_RFIDREADER Rfid_Main[];
extern STATE_RFIDREADER Rfid_Ack[];

STATE_RFIDREADER Rfid_Init[] =
{
    //EVENT,    NEXT,             ACTION
    { '2',      Rfid_Version,    &Rfid134Reader::VersionInit,  NULL },
    { ANY,      Rfid_Init,    &Rfid134Reader::Error,  NULL },
    { 0, NULL, NULL, NULL},
};

STATE_RFIDREADER Rfid_Error[] =
{
    //EVENT,    NEXT,             ACTION 
    { ANY,      Rfid_Init,       &Rfid134Reader::Error,        NULL },
    { 0, NULL, NULL, NULL},
};

STATE_RFIDREADER Rfid_Version[] =
{
    //EVENT,    NEXT,            ACTION 
    { EoF,     Rfid_Main,       &Rfid134Reader::Ready,        NULL },   
    { ANY,     Rfid_Version,    &Rfid134Reader::Store,        NULL },
    { 0, NULL, NULL, NULL},
};

STATE_RFIDREADER Rfid_Main[] =
{
    //EVENT,    NEXT,            ACTION
    { EoF,      Rfid_Main,       &Rfid134Reader::RfidReady,    NULL },
    { 'O',      Rfid_Ack,        NULL,                         NULL },
    { Error,    Rfid_Ack,        &Rfid134Reader::RfidReady,    NULL },
    { ANY,      Rfid_Main,       &Rfid134Reader::Store,        NULL },
    { 0, NULL, NULL, NULL},
};

STATE_RFIDREADER Rfid_Ack[] =
{
    //EVENT,    NEXT,             ACTION
    { EoF,      Rfid_Main,       &Rfid134Reader::Ready,    NULL },
    { ANY,      Rfid_Ack,        NULL,                     NULL },
    { 0, NULL, NULL, NULL},
};

Rfid134Reader::Rfid134Reader(Serial * port){
    this->port = port;
    port->baud(9600);
    port->format(8,SerialBase::None,1);
    port->attach(this,&Rfid134Reader::OnCharReceived);
    this->parser.Init(this, Rfid_Init);
    this->port->printf("VER\r");
};

void Rfid134Reader::Scan(){
    port->printf("SRA\r");
};

void Rfid134Reader::StopScanning(){
    port->printf("SRD\r");
};

void Rfid134Reader::OnCharReceived(){
    char c = port->getc();
    parser.ProcessEvent(c);
};

EventActionResult Rfid134Reader::Reset(char e){
    this->Data[0] = 0;
    return EventProcessed;
}

EventActionResult Rfid134Reader::RfidReady(char e){
    (this->target->*onRfidReady)(this->Data);
    Data[0] = 0;
    return EventProcessed;
}

EventActionResult Rfid134Reader::Store(char e){
    int len = strlen(Data);
    this->Data[len] = e;
    this->Data[len+1]= 0;
    return EventProcessed;
}

EventActionResult Rfid134Reader::Ready(char e){  
    this->Data[0] = 0;
    (this->target->*onReady)();
    return EventProcessed;
}

EventActionResult Rfid134Reader::VersionInit(char e){
    return EventProcessed;
}

EventActionResult Rfid134Reader::Error(char e){
    (this->target->*onError)(e);
    return EventProcessed;
}
```

Notice I'm using the same `statemachine` to model the interactions between the device and the CPU. This is pretty convenient. The machine looks like this in a nicer format:

![](https://docs.google.com/drawings/d/1cHJ8oP_k8-BarP4Z8R-1tWgXbLNGcADBbw9UUDIisvQ/pub?w=791&h=326)

> The above implementation is not complete, but close...

With this, I've got most of the software and hardware components ready, with the notable exception of:

* The case (the actual box to hold all this)
* Power (e.g. battery, charger, etc.)

I'm not super worried about power. I'm sure I can assemble something with [Sparkfun](http://sparkfun.com) parts.

The case on the other hand...I'm not keen on just using a standard prototype case. They are horrible.

So my plan is to learn a little bit of 3D design and, naturally, make a case for a 3D printer.


