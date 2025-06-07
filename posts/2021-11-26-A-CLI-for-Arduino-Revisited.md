---
layout: post
title: "A CLI for Arduino revisited"
date:   2021-11-26
categories: arduino
comments: true
author: Eugenio Pace
---

A [reader](https://disqus.com/by/edgarbonet/?) of this blog pointed out that my implementation of the Arduino CLI was using memory sub-optimally. He also wrote my implementation would not work on an Arduino UNO. I don't have one, so I cannot test it. 

I liked the challenge and I like permanent improvement, so here I am revisiting the implementation and following his advice.

> He also pointed out correctly that I have a busy wait for input.

The main objection was that I was (unnecessarily) storing all arguments for a specific command. Instead, he suggested storing pointers to each argument and just use a single buffer.

Here's an improved version that uses exactly this approach. I also took the opportunity to refactor the code a little bit and make it more compact:

```c
#ifndef CLI_H
#define CLI_H

#define MAX_NUM_ARGS 10
#define LINE_BUF_SIZE 100

enum { CMD_OK, CMD_ERROR, CMD_EXIT, CMD_SKIP };

typedef struct cmd {
  const char * cmd_name;
  int (*cmd_handler)(struct cmd *, char * args[MAX_NUM_ARGS]);
  const char ** aliases;
  const char * help_text;
} CMD;


class CLI {

  char line[LINE_BUF_SIZE];
  char * args[MAX_NUM_ARGS];
  CMD * cmds;
  int cmd_len;
  
public:
  CLI( CMD * c, int len){
    cmds = c;
    cmd_len = len;
  }

  int run(){
    int ret = CMD_OK;
  
    Serial.print("> ");
    if( read_line() ){
      if( parse_line() ){
        ret = executeCommand(args);
      }
    }
    memset(line, 0, sizeof(line));
    memset(args, 0, sizeof(args));
    return ret;
  }

private:
  int parse_line(){
    char *argument;
    int counter = 0;
    
    argument = strtok(line, " ");
    
    while((argument != NULL)){
        if(counter < MAX_NUM_ARGS){
            args[counter++] = argument;
            argument = strtok(NULL, " ");   //Save all argument pointers
        }
        else{
            break;
        }
    }
    return counter;
  }
  
  char * read_line(){
    
    while(!Serial.available()); // Busy wait on Serial for input
    
    if(Serial.readBytesUntil('\n', line, sizeof(line))<sizeof(line)){
      Serial.println(line); //Echo
      return line;
    }

    Serial.println("Input string too long.");
    return NULL;
  }
  
  CMD * findCommand(char * command){
    if(!command || strlen(command) == 0){
      return NULL;
    }
  
    for(int i=0; i<cmd_len; i++){
        //Search by name
        if(!strcmp(command, cmds[i].cmd_name)){
            return &cmds[i];
        }
        //Search all aliases
        if(cmds[i].aliases){
          int j = 0;
          while(cmds[i].aliases[j]){
            if(!strcmp(command, cmds[i].aliases[j++])){
              return &cmds[i];
            }
          }
        }
    }
    return NULL;  //Invalid command
  }

  void printCommandHelp(CMD * c){
    Serial.print("Usage of [");
    Serial.print(c->cmd_name);
    Serial.print("]. ");
    Serial.println(c->help_text);
    return;
  }
  
  int executeCommand(char * args[]){ 
    CMD * c = findCommand(args[0]);
    if(c){
      //If command is found and first argument to command is "help", then show help text
      if(!strcmp(args[1], "help")){
        printCommandHelp(c);
        return CMD_OK;
      }

      //Run command
      return (*c->cmd_handler)(c, args);
    }

    //If the command itself is "help" (or "h")
    if(!strcmp(args[0], "help")|| !strcmp(args[0], "h")){
      cmd_help(args);
      return CMD_OK;
    }

    //No luck...
    Serial.println("Invalid command. Type \"help\" for more.");
    return CMD_ERROR;
  }

  //This function will be called if "help" is args[0]. args[1] can be a command, "help" or invalid one
  void cmd_help(char * args[]){
    //If no args to help command, just show all available commands.
    if(args==NULL || args[1] == NULL){
      Serial.println("The following commands are available:");
      for(int i=0; i<cmd_len; i++){
          Serial.print("  ");
          Serial.print(cmds[i].cmd_name);
          if(cmds[i].aliases){
            Serial.print("  (");
            int j = 0;
            while(cmds[i].aliases[j]){  //Show all aliases
              Serial.print(cmds[i].aliases[j]);
              if(cmds[i].aliases[j+1]){
                Serial.print(", ");
              }
              j++;
            }
            Serial.print(")");
          }
          Serial.println("");
      }
      Serial.println("");
      return;

    } else {

      //help on help?
      if(!strcmp("help", args[1])){
        Serial.println("Displays help. You can do `help {command}`");
        return;
      }

      //We've got here because there's an argument to help. e.g. "help cmd_foo"
      //Try to find command
      CMD * c = findCommand(args[1]);
      if(c == NULL){
        if(c == NULL) { Serial.println("Command not found"); }
        //Print all available commands
        cmd_help(NULL);
      } else {
        printCommandHelp(c);
      }

      return;
    }
  }
};
#endif
```

This version saves memory (about 1K with 10 arguments with the current `#define`'s), and also avoids extra `strcpy`'s, making it (slightly) faster although I have not measured that. I also removed all `String` use and cleaned up and simplified the code overall.

For completeness, here's the new sample sketch with a couple commands:

```c
#include "cli.h"

int cmd_millis(char * args[]); //[ARG_BUF_SIZE]);
int cmd_about(char * args[]); //[ARG_BUF_SIZE]);

//All aliases for commands
const char * m[] = {"m", "clk", "time", "millis", NULL};
const char * a[] = {"a", "abt", "about", NULL};

CMD cmds[] = {
  // name, handler, aliases, help_text 
  {
    "millis", cmd_millis, m, "Displays milliseconds since board began running this program.",
  },
  {
    "about", cmd_about, a, "Displays milliseconds since board began running this program.",
  }
};

CLI cli(cmds, sizeof(cmds)/sizeof(CMD));

// SPECIFIC COMMANDS
int cmd_about(char * args[]){
  Serial.println("A sample for CLI");
  return CMD_OK;
}

int cmd_millis(char * args[]){
  //Show 'millis' in 'seconds'
  if(!strcmp(args[1], "sec")){
    Serial.println(millis()/1000);
    return CMD_OK;
  }

  Serial.println(millis());
  return CMD_OK;
}

void setup() {
  Serial.begin(9600);
  while(!Serial);
}

void loop() {
  // put your main code here, to run repeatedly:
  cli.run();
}
```

In the example the only changes are:

1. The signature of a command function is now `int f(char * args[])`
2. In the `cmd_millis` command, I've added a new optional argument `sec` for showing the result in `seconds`.
3. The `help text` for each command is now part of the CMD data structure, so it is all in one place.

Sample output:

```sh
16:41:40.368 -> > help
16:41:47.950 -> The following commands are available:
16:41:47.950 ->   millis  (m, clk, time, millis)
16:41:47.950 ->   about  (a, abt, about)
16:41:47.950 -> 
16:41:47.950 -> > h
16:41:50.222 -> The following commands are available:
16:41:50.222 ->   millis  (m, clk, time, millis)
16:41:50.222 ->   about  (a, abt, about)
16:41:50.222 -> 
16:41:50.222 -> > millis
16:41:55.983 -> 88899
16:41:55.983 -> > 
16:41:56.777 -> > millis sec
16:42:00.849 -> 93
16:42:00.849 -> > 
16:42:01.823 -> > a
16:42:04.663 -> A sample for CLI
16:42:04.663 -> > 
16:42:05.644 -> > a help
16:42:09.526 -> Usage of [about]. Displays milliseconds since board began running this program.
16:42:09.526 -> > 
16:42:10.247 -> > help help
16:42:15.170 -> Displays help. You can do `help {command}`
16:42:15.170 -> > 
```

Thanks to Edgar for the suggestions!


