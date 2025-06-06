---
layout: post
title:  "Building a simple data capturing device - Part III"
date:   2016-12-17
categories: mbed iot rfid
comments: true
author: Eugenio Pace
---

With the basic modules and general architecture in place, it is time to build the heart (or the brain) of the device.

I chose to model my app with a simple state machine. State machines are simple and powerful. They are resilient to changes in requirements as we add new inputs and reactions. In my case, inputs will come from 2 sources:

1. The keyboard
2. The RFID reader (a serial device)

The device will have 5 capturing functions. Each function is activated by a menu option.

Every keystroke and character sent by the RFID reader are events into a state machine that drives its logic.

For example, in the initial state (let's call it `Main`) there are seven inputs that matter: 

1. A **number** for each menu option (`1` to `5`). If the user presses `1`, it means selection of first menu item. `2` means second, etc. 
2. The `Up` or `Down` keys. Since the display I'm using has 2 lines, and the menu has more than 2 options, I need to scroll the menu in ether direction.

![](https://docs.google.com/drawings/d/e/2PACX-1vR_obhVHi0kfoSObDmXRZQnkKa2VOAFI7AHNmwlRymDlPYIPQrszPMsOtsdAWQo5Jqb3Che3YGsHkA_/pub?w=945&h=320)

Any other key strokes (at that stage) are to be ignored.

At any point in time, the machine is in one state (e.g. `Main`). Every input is analyzed against all possible, acceptable events, and when a match is found two things happen:

1. The machine **evolves into a different state** (e.g. user wants to capture weight, we activate that module).
2. An **action is performed** (e.g. scroll, store, capture a digit, turn on the RFID reader, etc).
3. Optionally, the action itself might change the state of the machine.

Here's a super simple state machine implemented in C++:

```c++
enum EventActionResult { EventProcessed, ActionDone, EventIgnored };

template<class T>
class State {
    public:
        char InputEvent;
        State<T> * NextState;
        EventActionResult (T::*Action)( char event );
        State<T> * DoneState;
};

#define ANY '*'

template<class T>
class StateMachine {
    private:
        State<T> * init;
        State<T> * current;
        T * target;

    public:
        StateMachine(){
        }
        
        void Init( T * _target, State<T> * initialState ){
            init = current = initialState;
            target = _target;
        }

        void Reset(){
            current = init;
        }
    
        EventActionResult ProcessEvent( char event ){
            for(State<T> * p = this->current; p->NextState != NULL; p++){
                if(p->InputEvent == event || p->InputEvent == ANY){
                    if( p->Action != NULL ){
                        //Action is defined, call function, otherwise ignore.
                        if(ActionDone == (this->target->*(p->Action))(event)){
                            if(p->DoneState != NULL){
                                //If action is "done" and there is a "done" state defined, then go there.
                                this->current = p->DoneState;
                            } else {
                                this->current = p->NextState;
                            }
                            return ActionDone;
                        }
                    }
                    this->current = p->NextState;
                    return EventProcessed;
                }
            }

            //Event not found. Do nothing
            return EventIgnored;
        }        
};
```

There're 2 types here:

* `template<class T> class State` 
* `template<class T> class StateMachine`

The first one will allow us to define an **entry** for a `State`. (Perhaps I should have called it `StateEntry`...). A `State` is really an array of `State<T>`. So the entire machine can be modeled as a table. I can take advantage of initializers and build this table (I'll show later on) to easily define what are all the _stimuli_ my machine will react to. This syntax will make it very readable.

Notice that `State` has 4 members: 

* The **expected** event (`InputEvent`).
* The **action** ( the `(T::*Action)( char event )` function pointer)
* The **next state** to go to after the `InputEvent` is received and processed (`NextState`).
* An optional **Done state** (`DoneState`), in case the `Action` returns an **I'm done**.

`StateMachine` is the actual instantiation of the machine. The most important method is `ProcessEvent(char event)`.

> I'm using templates because I want a specific type for actions to be performed. Actions will be in essence methods in a class (T). Thus this magic:

```c++
...
this->target->*(p->Action))(event);
...
```

That's a little bit of C++ magic woo, that it will become apparent once I define _my_ machine.

Also, each **module** in my app (an option in the menu) is its own `statemachine` (or can be modeled that way). That is: when I select menu `1` to `capture production`, all input of capturing a **Tag**, **Liters**, **Saving**, etc. can be modeled as a state machine in itself. So it is an advantage to be more generic in this case.

Let's start with the basic implementation of scrolling up and down. 

I start with the definition of an `App` (`app.h`). This is the "main" module:

```c++

#define LINES_ON_DISPLAY 2

// Two possible events Up or Down
enum AppEvents { Up='U', Down='D' };

//  
typedef State<class App> STATE;

class App{

private:
    //Statemachines
    StateMachine<App> appStateMachine;

    //Devices
    Keyboard * keyboard;
    Display * display;

    //State
    int currentMenuLine;
    static const char * Menu[];

public:
    App(Display * display, Keyboard * keyboard);

    void Init();

    void Start();
        
    void DisplaySplash();

    // Forwards to the right state machine.
    void ProcessEvent(char event);
  
    EventActionResult PrintMenu(char event);
    EventActionResult ScrollUp(char event);
    EventActionResult ScrollDown(char event);
};
```

Now the actual implementation:

```c++
#include "app.h"

//
const char * App::Menu[] =  {//1234567890123456
                              "1.Find RFID",
                              "2.Capture Weight",
                              "3.Capture Prod.",
                              "4.Assign RFID",
                              "5.Synch" };
//
STATE Main[] =
{
    //EVENT, NEXT, ACTION,           DONE (where to land if the action is "done")
    { Up,    Main, &App::ScrollUp,   NULL }, 
    { Down,  Main, &App::ScrollDown, NULL },
    { 0,     NULL, NULL,             NULL   },
};    

App::App(Display * display, Keyboard * keyboard)
{
    this->keyboard = keyboard;
    this->display = display;
}

//
void App::Init()
{
    this->appStateMachine.Init(this, Main);
    this->Reset(NULL);
    this->currentMenuLine = 0;
}

//The App main entry point. Returning from here exists the program
void App::Start(){
    this->PrintMenu(0);
    while( 1 ){
        char key = this->keyboard->GetKey();
        this->ProcessEvent(key);
    }
}

void App::ProcessEvent(char event){
    this->appStateMachine.ProcessEvent( event );
}

///*
// Displays the main menu in the current state. Menus support scrolling up and down
// */
EventActionResult App::PrintMenu(char event){
    this->display->Cls();
    this->display->Printf(0,"%s",Menu[currentMenuLine]);
    this->display->Printf(1,"%s",Menu[currentMenuLine+1]);
    return EventProcessed;
}

// Resets menu & state
EventActionResult App::Reset(char event){
    //Reset menu
    currentMenuLine = 0;
    
    //No cursor    
    this->display->ClearCursor();

    //Print menu
    return this->PrintMenu(event);
}

EventActionResult App::ScrollUp(char event){
    if(currentMenuLine>0){
        currentMenuLine--;
    }
    return this->PrintMenu(event); 
}

EventActionResult App::ScrollDown(char event){
    if(currentMenuLine < (sizeof(Menu)/sizeof(const char *))-LINES_ON_DISPLAY){
        currentMenuLine++;
    }
    return this->PrintMenu(event); 
}
```

The magic is in this table:

```
STATE Main[] =
{
    //EVENT, NEXT, ACTION,           DONE STATE
    { Up,    Main, &App::ScrollUp,   NULL }, 
    { Down,  Main, &App::ScrollDown, NULL },
    { 0,     NULL, NULL,             NULL },
};    
```

It means:

1. If the machine gets an `Up` event, then stay in the same state `Main` and call the `ScrollUp` action.
2. If the machine gets a `Down`, then stay in the same state `Main` and call `ScrollDown`.
3. The `null` event signals the `end of table`.

While I can have this to `printf` all over the place, I'd like to have a more systematic way of adding functionality and verifying that everything works just fine.

> I'm far from being a perfect TDD devout, but I do like building test harnesses for my apps. I typically hack a little bit, build a test, add new tests that fail, hack some more. So, not "pure" TDD, but it works for me. I'm a pragmatist. I'm only dogmatic about not being dogmatic.

The main reason is that I get to work on this projects only occasionally, so when I find the time to work on them, I usually read the tests first, to remember what the intent was. Also, if I try something crazy, I have the confidence of testing that most things work as expected.

Next: building a simple test harness for my app and add more functionality.