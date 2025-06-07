---
layout: post
title:  "Building a simple data capturing device - Part II"
date:   2016-12-10
categories: mbed iot
comments: true
author: Eugenio Pace
---

In the [first part of this series](/post/2016-11-25-Building-a-simple-data-capturing-device-i.markdown%}) I introduced the basic hardware for a data capturing device. 

As a recap, this is a device intended to allow someone in the field to capture:

1. Cow milk production
2. Cow weight
3. Cow identification with RFIDs

In this 2nd part I describe the software components and approach I will be using.

## The Dev environment

There are many options to programming an mbed device. The easiest and simplest is to use their awesome online editor and compiler. 

It is possible to download the toolchain, and develop offline, but I have not have the need. My internet access is super fast, and I really don't notice the speed difference.

> Ironically, as I was writing this article, the online compiler had a number of issues that I have not experienced before. Fortunately, they were resolved quickly.

Just sign-up to [developer.mbed.org](https://developer.mbed.org) and jump into the compiler. It comes with integrated source control and easy access to libraries.

> The standard C library is available for your projects. That's a great start if you are familiar with it. Years and years of proven

The online compiler is fast and will generate a downloadable binary. Since the **mbed** board mounts itself as a drive on the host computer, you can simply map it to the preferred browser downloads location. Then on each (successful) compile the new binary will be automatically installed on the board.

## There's no OS

Welcome to embedded development! There's no "OS", but you don't really need one unless you are building a real-time controller for a factory or a car, or something like that. This is a non-critical, simple device that mostly captures events from the keyboard and displays messages on a LCD.

> MBED does actually provide an "OS" with higher abstractions like threads, and tasks, etc. But this is a relatively  simple app, so I won't bother.

MBED ships with tons of libraries. For the most part, you've got pretty much everything covered. Their [cookbook](https://developer.mbed.org/cookbook/Homepage) is filled with excellent and comprehensive articles and examples.

The default language is C++, and it is hard. But not too bad. Fortunately, there are libraries for most of the components I need.

> C++ is kind of the **burpee** of programming.

## Modeling the Peripherals

I need a way of modeling the devices the CPU interacts with:

1. Keyboard
2. Display
3. RFID reader
4. Store

For each of these I created a type that defines the contract with the app and the operations allowed. To start simple:

### The display

```c++
class Display {
public:
  virtual void Cls() = 0;
  virtual void Printf(int line, char * fmt, ...) = 0;
  virtual void SetCursor(int line, int position) = 0;
  virtual void ClearCursor() = 0;
};
```

The display I'll be using has just 2 lines. I like the flexibility of `printf`, so I'll be using the same API. I will be entering values with a keyboard, so I also need a way of positioning the cursor. Thus, the methods above.


### The keyboard

```c++
class Keyboard {
public:
  virtual char GetKey() = 0;
  virtual void Splash() = 0;
};
```

I'll deal with the actual final implementations later on. One great thing about MBED is that you can connect with a terminal for `stdin` and `stdout`. So for both of these, I can write an implementation that is connected to the host computer:

### The Mock Display

```c++
class MockDisplay : public Display{
public:
  MockDisplay(){
  }

  virtual void Cls(){
    printf("CLS\r\n");
  }

  virtual void Printf(int line, char * fmt, ...){
    printf("\r\nL-%d:", line);
    va_list ap;
    va_start(ap, fmt);    
    vprintf(fmt, ap);
    va_end(ap);
  }

  virtual void SetCursor(int line, int position){
    printf("Setting cursor: %d %d:\r\n", line, position);
  }

  virtual void ClearCursor(){
    printf("Clear cursor\r\n");    
  }
};
```

### The mock Keyboard

```c++
class MockKeyboard : public Keyboard {
public:
  MockKeyboard(){
  }

  virtual void Splash(){
    printf("Splash Keybaord\r\n");    
  }

  virtual char GetKey(){
    return getchar();    
  }
};
```

### The store

Having being spoiled by using SQL and MongoDB, I'm now back in the world of `FILE *` and `fopen`.

So I started with a very simple abstraction for the store:

```c++
class Store{

public:
    enum StoreResult { OK, FILE_ERROR };
    
    Store(){
    }
    
    virtual ~Store(){
    }
    
    virtual char * Find(char * key) = 0;
    virtual StoreResult Add(char * fmt, ...) = 0;
};
```

And then one concrete implementation to test the local file system:


```c++
class FileStore : public Store {
    private:
        char * dataFile;
        char * record;
        int recordSize;

    public:
    
        FileStore(char * dataFile, int maxRecordSize){
            this->dataFile = dataFile;
            this->record = (char *)malloc(maxRecordSize);
            this->recordSize = maxRecordSize;
        }
    
        virtual ~FileStore(){
            free(this->record);
        }
        
        virtual char * Find(char * key){

            int keyLen = strlen(key);
            
            FILE * f = fopen(this->dataFile, "r");
        
            if(f == NULL){
                return NULL;
            }
        
            while(fgets(record, recordSize, f) != NULL){    
                if(!strncmp(key,record,keyLen)){
                    const size_t len = strlen(record);
                    for(int i = 0; i < len; i++){
                        if((record[i] == '\r') || (record[i] == '\n')){
                            record[i] = '\0';
                        }
                    }
                    break;
                }
                record[0]=0;
            }
    
            fclose(f);
            return record;
        }
        
        virtual StoreResult Add(char * fmt, ...){
        
            FILE * f = fopen(this->dataFile, "a");
        
            if(f == NULL){
                return FILE_ERROR;
            }
            
            va_list args;
            va_start(args, fmt);
            vfprintf(f, fmt, args);
            
            fclose(f);
            
            va_end (args);
            return OK;
        }
};
```

These are self explanatory. Another great example of MBED's choice to use the `stdlib`. I can simply write to the file system.

The `Find` function, simply scans the records (that are assumed to be stored in lines), and tries to match the `key` with a simple string comparison. As soon as it finds the match, it returns the entire line.


## Quick and Dirty tests

Let's check everything works with a very simple program:

```c++
#include "mbed.h"

#include "keyboard.h"

#include "store.h"
#include "display.h"

#define DEBUG

#ifdef DEBUG
    #include "Mocks/mockDisplay.h"
    #include "Mocks/mockKeyboard.h"
#else
    //add the real ones once we have them
#endif

//Enable the Local filesystem
LocalFileSystem local("local");

int main()
{
  //Test Display
  Display * display = new MockDisplay();

  display->Cls();

  display->Printf(0, "%d %s", 1, "Hello");
  display->Printf(1, "%d %s", 2, "world");

  //Test Keyboard
  Keyboard * keyboard = new MockKeyboard();
  printf("%c\r\n", keyboard->GetChar());

  //Test store (more of an integration test)
  Store * data = new FileStore("/local/data.txt", 50);
  data->Add("%d:%s\n", 0, "Some data"); 
  data->Add("%d:%s\n", 1, "More data"); 
  data->Add("%d:%s\n", 2, "Last record"); 

  printf("%s\r\n", data->Find("1"));

  return 0;
}

```

Now I can easily check the basics are working and get the instant satisfaction of seeing bytes go across a wire and on my screen.

Next step: clearly, I need a more robust way of developing the app and modules. Throwing `printf` here and there is ok, but I'd like a better harness.
