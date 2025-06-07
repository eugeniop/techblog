---
layout: post
title: "A CLI for Arduino - followup"
date:   2020-10-30
categories: arduino
comments: true
author: Eugenio Pace
---

In a [previous post](/post/2020-01-25-A-Simple-Command-Line-Interface-for-Arduino.md) I described a simple approach for sending commands to an Arduino based project via the `Serial` interface.

A reader of this blog asked for a complete sample, so I took some time to refactor the code a little bit and build a running sample. And here it is:

> This is not to be confused with the [Arduino CLI](https://github.com/arduino/arduino-cli), which is something completely different.

### The CLI class

Save this in your Arduino project as `cli.h`. This is generic and will work for any commands.

```c++
#ifndef CLI_H
#define CLI_H

#define ARG_BUF_SIZE 100
#define MAX_NUM_ARGS 10
#define LINE_BUF_SIZE 128

enum { CMD_OK, CMD_ERROR, CMD_EXIT, CMD_SKIP };

typedef struct {
  const char * cmd_name;
  int (*cmd_handler)(char args[][ARG_BUF_SIZE]);
  const char ** aliases;
} CMD;


class CLI {

  char line[LINE_BUF_SIZE];
  char args[MAX_NUM_ARGS][ARG_BUF_SIZE];
  
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
    if( read_line(line) ){
      if( parse_line(line, args) ){
        ret = executeCommand(args);
      }
    }
    memset(line, 0, LINE_BUF_SIZE);
    memset(args, 0, sizeof(args[0][0]) * MAX_NUM_ARGS * ARG_BUF_SIZE);
    return ret;
  }

  int help(char args[][ARG_BUF_SIZE], const char * cmd, const char * helpString){
    if(!strncmp(args[1], "help", 4)){
      Serial.print("Usage ");
      Serial.print(cmd);
      Serial.print(". ")
      Serial.println(helpString);
      return CMD_OK;
    }
    return CMD_SKIP;
  }

private:
  int parse_line(char * line, char args[][ARG_BUF_SIZE]){
    char *argument;
    int counter = 0;
    
    argument = strtok(line, " ");
    
    while((argument != NULL)){
        if(counter < MAX_NUM_ARGS){
            if(strlen(argument) < ARG_BUF_SIZE){
                strcpy(args[counter], argument);
                argument = strtok(NULL, " ");
                counter++;
            }
            else{
                Serial.println("Input string too long.");
                return 0;
                break;
            }
        }
        else{
            break;
        }
    }
    return counter;
  }
  
  char * read_line(char * line){
    String line_string;
    
    while(!Serial.available());
    
    if(Serial.available()){
        line_string = Serial.readStringUntil('\n');
        if(line_string.length() < LINE_BUF_SIZE){
          line_string.trim(); //removes any trailing space or \r or \t
          line_string.toCharArray(line, LINE_BUF_SIZE);
          Serial.println(line_string);
          return line;
        }
        else{
          Serial.println("Input string too long.");
          return NULL;
        }
    }
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
    return NULL;
  }
  
  int executeCommand(char args[][ARG_BUF_SIZE]){  
    CMD * c = findCommand(args[0]);
    if(c){
      return (*c->cmd_handler)(args);
    }

    if(!strcmp(args[0], "help")|| !strcmp(args[0], "h")){
      return cmd_help(args);
    }
    
    Serial.println("Invalid command. Type \"help\" for more.");
    return 0;
  }
  
  int cmd_help(char args[][ARG_BUF_SIZE]){
    if(strlen(args[1])==0){
      Serial.println("The following commands are available:");
      for(int i=0; i<cmd_len; i++){
          Serial.print("  ");
          Serial.print(cmds[i].cmd_name);
          if(cmds[i].aliases){
            Serial.print("  (");
            int j = 0;
            while(cmds[i].aliases[j]){
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
      return CMD_OK;
    } else {
      CMD * c = findCommand(args[1]);
      char _args[MAX_NUM_ARGS][ARG_BUF_SIZE];
      if(c == NULL || !strcmp("help", c->cmd_name)){
        if(c == NULL) { Serial.println("Command not found"); }
        strcpy(_args[0], "help");
        strcpy(_args[1], "");
        returns cmd_help(_args);
      }
      strcpy(_args[0], c->cmd_name);
      strcpy(_args[1], "help");
      return (*c->cmd_handler)(_args);
    }
  }
};
#endif
```

And the `.ino` file for the sample. In this example, we have 2 commands:

1. `about` that prints a message. 
2. `millis` that prints the output of the `millis()` function.

Notice that there are various *aliases* for each command. e.g. `a` and `abt` for `about`.

`help` will automatically be added by the `CLI` class.

```c++
#include "cli.h"

int cmd_millis(char args[][ARG_BUF_SIZE]);
int cmd_about(char args[][ARG_BUF_SIZE]);

//All aliases for commands
const char * m[] = {"m", "clk", "time", "millis", NULL};
const char * a[] = {"a", "abt", "about", NULL};

CMD cmds[] = {
  {
    "millis", cmd_millis, m
  },
  {
    "about", cmd_about, a
  }
};

CLI cli(cmds, sizeof(cmds)/sizeof(CMD));

// SPECIFIC COMMANDS
int cmd_about(char args[][ARG_BUF_SIZE]){
  //Check if user called "help about" and displays a help message
  if(cli.help(args, "about", "Displays a message")==CMD_OK){
    return CMD_OK;
  }

  Serial.println("A sample for CLI");
  return CMD_OK;
}

int cmd_millis(char args[][ARG_BUF_SIZE]){
  if(cli.help(args, "millis", "Displays milliseconds since board began running this program.")==CMD_OK){
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

Every command is a function with this prototype:

```c++
int f(char args[][ARG_BUF_SIZE]);
```

Generally, it will have this structure:

```c++
int f(char args[][ARG_BUF_SIZE]){
  if(cli.help(args, "mycommand", "The help text of the command") == CMD_OK){
    return CMD_OK;
  }

  //Your code here
  
  return CMD_OK;
}
```

It must return `CMD_OK` or `CMD_FAIL`.

The `CLI::help` method, allows each command to return a help message. `CLI::run` is the main entry point. It will return immediately if there are no characters on `Serial`. It will wait until `\n` is sent.


This is the output when the sample runs:

```sh
21:45:56.188 -> > help
21:45:58.416 -> The following commands are available:
21:45:58.416 ->   millis  (m, clk, time, millis)
21:45:58.416 ->   about  (a, about)
21:45:58.416 -> 
21:45:58.416 -> > about
21:46:04.993 -> A sample for CLI
21:46:04.993 -> > 
21:46:06.415 -> > time
21:46:11.823 -> 40475
21:46:11.823 -> > m
21:46:13.565 -> 42221
21:46:13.565 -> > millis
21:46:15.754 -> 44406
21:46:15.754 -> > help millis
21:46:19.753 -> Usage millis. Displays milliseconds since board began running this program.
21:46:19.753 -> > 
```
