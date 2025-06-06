---
layout: post
title:  "A simple test harness for MBED based apps"
date:   2016-12-24
categories: mbed iot testing
comments: true
author: Eugenio Pace
---

With the basic architecture in place, I set on building a more automated way of verifying that I'm on the right track. There are a few unit test frameworks for C++ that I found googling around, but all seemed very complicated. I opted for a simpler approach.

> Additionally, I wanted to run tests on the device itself. Cross compiling was tempting, but I figured I would get higher assurance I'm doing the right thing on the device itself. I'm concerned, for example, with the memory I have available (32K). My MBP has 8GB for comparison...

## A base Test class

I started with a simple base `Test` class that defines the following:

```c++
class Test{
protected:
    Assert assert;  
public:
    virtual void Run() = 0;      
}; 
```

`Assert` is a simple class with a bunch of `AreEqual` methods for comparing `expected` and `actual`:

```c++
class Assert {

public:
    Assert(){
    }

    void AreEqual(char * expected, char * value){
        if( strcmp(expected,value) == 0 ){
            printf("PASS\r\n");
        } else {
            printf("FAIL: Expected [%s], got [%s]\r\n", expected, value);
        }    
    };

    void AreEqual(char expected, char value){
        if( expected == value ){
            printf("PASS\r\n");
        } else {
            printf("FAIL: Expected [%c], got [%c]\r\n", expected, value);
        }    
    };

    void AreEqual(int expected, int value){
        if( expected == value ){
            printf("PASS\r\n");
        } else {
            printf("FAIL: Expected [%d], got [%d]\r\n", expected, value);
        }    
    };
};
```

A simple test would look like this:

```c++
class SimpleTest : public Test{
public:
    virtual void Run(){
        printf("Simple Test\r\n");
        assert.AreEqual(3, 1+2);    
        assert.AreEqual("Expected","Actual");     
    };  
};
```

The `main`:

```c++
Test * tests[] = { 
                  new SimpleTest(),
                };
                 
printf("\r\nSTART:\r\nRunning Tests - (%d)\r\n-->\r\n", sizeof(tests)/sizeof(Test *));
for( int x=0; x<sizeof(tests)/sizeof(Test *);x++ ){
    tests[x]->Run();
    printf("--------------------------------------\r\n");
}
```

> Notice that now, I can simple add new `Test`s to the array, compile and run.

When run, I get:

```sh
START:
Running Tests - (1)
-->
Simple Test
PASS
FAIL: Expected [Expected], got [Actual]
--------------------------------------
```

## Testable mocks

I want to be able to simulate everything (with minimum effort), and automatically verify the expectations are met.

For example, the **Display** has only a handful of operations allowed:

```c++
class Display {

public:
    virtual void Cls() = 0;
    virtual void Printf(int line, char * fmt, ...) = 0;
    virtual void SetCursor(int line, int position) = 0;
    virtual void ClearCursor() = 0;
};
```

My **MockDisplay** simply records all commands (and data):

```c++
enum Command { CLS, PRINT, SET_CURSOR, CLEAR_CURSOR };

typedef struct display {
    Command cmd;
    char data[20];
} DISPLAY;

class MockDisplay : public Display {
private:
    DISPLAY history[50];
    int entries;

public:
    MockDisplay(){
        entries=0;
    }
    
    int GetCommandsQty(){
        return entries;
    }
    
    DISPLAY * GetHistory(int i){
        return &history[i];
    }
    
    void PrintHistory(){
        for(int x=0;x < entries;x++ ){
            printf("%d -> CMD: %d, DATA: %s\r\n", x, history[x].cmd, history[x].data );
        }
        printf("-----------------------------------\r\n");
    };
    
    void Reset(){
        entries = 0;
        memset(history,'\0', sizeof(history));
    }
    
    virtual void Cls(){
        history[entries].cmd = CLS;
        entries++;
    }
    
    virtual void Printf(int i, char * fmt, ...){
        va_list ap;
        va_start(ap, fmt);    
        history[entries].cmd = PRINT;
        vsprintf(history[entries].data, fmt, ap);
        entries++;
        va_end(ap);
    }
    
    virtual void SetCursor(int line, int position){
        history[entries++].cmd = SET_CURSOR;
    }
    
    virtual void ClearCursor(){
        history[entries++].cmd = CLEAR_CURSOR;
    }
};
```

Now I can test any component that uses `Display`:

```c++
class Test_Display : public Test {

    Display * display;
    MockDisplay * d_test;
    
public:

    Test_Display(){
        display = new MockDisplay();
        d_test = (MockDisplay *)display;    
    }
    
    ~Test_Display(){
        delete display;
    }

    virtual void Run(){
        TestCLS();
        TestPrintf();
    }    
    
    void TestCLS(){
        printf("Test CLS\r\n");
        d_test->Reset();    
        display->Cls();
        assert.AreEqual(CLS, d_test->GetHistory(0)->cmd);
    }
    
    void TestPrintf(){
        printf("Test Printf\r\n");
        d_test->Reset();
        display->Printf(0, "%d %s", 1, "Hello");
        display->Printf(1, "%d %s", 2, "world");
        assert.AreEqual("1 Hello", d_test->GetHistory(0)->data);
        assert.AreEqual("2 world", d_test->GetHistory(1)->data);
    }
};
```

The process is simple now:

1. Create a new `Test`
2. Add it to the array in `main`
3. Compile, reset, run

```sh
START:
Running Tests - (2)
-->
Test CLS
PASS
Test Printf
PASS
PASS
--------------------------------------
Simple Test
PASS
FAIL: Expected [Expected], got [Actual]
--------------------------------------
```

## Testing with memory

Being a device with resource constraints (memory!), I want to make sure I'm not leaking anywhere. So I enhanced the base `Test` class a little bit to run the same tests with a very straight forward memory check:

```c++
class Test{
protected:
    Assert assert;  
    int startMemory;
public:
    void RunWithMemoryCheck(){
        startMemory = FreeMem();
        Run();
        printf("Memory check:\r\n");
        assert.AreEqual(startMemory,FreeMem());
    }
    virtual void Run() = 0;      
};
```

It will simply take a snapshot of available memory before running, and then compare it with the memory available at the end.

I could not find a very elegant way of querying MBED for available memory, so after a little _googling_ and _stackoverflowing_, I (copied) a function that uses `malloc` to get the free memory. 

> Thanks to [Robert Spilleboud](https://developer.mbed.org/users/robertspil/) for his answer [here](https://developer.mbed.org/questions/6994/How-to-print-Free-RAM-available-RAM-or-u/), from where I took the code.

The techinque consists of calling `malloc` until it fails, then frees it all up again:

```c++
#define FREEMEM_CELL 100
struct elem { /* Definition of a structure that is FREEMEM_CELL bytes  in size.) */
    struct elem *next;
    char dummy[FREEMEM_CELL-2];
};

int FreeMem(void) {
    int counter;
    struct elem *head, *current, *nextone;
    current = head = (struct elem*) malloc(sizeof(struct elem));
    if (head == NULL)
        return 0;      /*No memory available.*/
    counter = 0;

    do {
        counter++;
        current->next = (struct elem*) malloc(sizeof(struct elem));
        current = current->next;
    } while (current != NULL);
    /* Now counter holds the number of type elem
       structures we were able to allocate. We
       must free them all before returning. */
    current = head;
    do {
        nextone = current->next;
        free(current);
        current = nextone;
    } while (nextone != NULL);
 
    return counter*FREEMEM_CELL;
}
```

I guess it is not super efficient, but it did help me find all leaks I had, so...good enough for me!

> Note to self: `free` and `delete` are your friends. Same with `virtual destructors`.
