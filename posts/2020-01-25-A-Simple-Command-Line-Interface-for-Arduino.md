---
layout: post
title: "A Simple Command Line Interface for Arduino"
date:   2020-01-25
categories: arduino eink cli
comments: true
author: Eugenio Pace
---

In a [previous post](/post/2020-01-18-A-Display-of-Stoic-Quotes-using-Arduino-and-e-Paper-Display.md) I described a simple display of quotes using an ePaper and an Arduino board. There's no interface (keyboard, buttons, touchscreen), so all interactions and configuration must happen through the terminal (via the USB connection).

Mimicking a shell, I wanted to be able to enter commands such as this:

```sh
> time
  Date & Time: 18/01/20 - 21:23

> debug on
  Debug is ON

> debug off
  Debug is OFF
```

I also wanted to:

1. Display *help* on any command
2. Allow commands to have aliases (e.g. `debug`, `dbg` would be equivalent)
3. Allow subcommands (with aliases too):

```sh
> config get TZ
TZ=-8
> config g TZ
TZ=-8
> cfg get TZ
TZ=-8
```

> The example above displays the contents of a config parameter `TZ`.

The fundamental data structure is:

```c
typedef struct {
  const char * cmd_name;
  int (*cmd_handler)(char args[][ARG_BUF_SIZE]);
  const char ** aliases;
} CMD;
```

And an example of my definitions:

```c
int cmd_help(char args[][ARG_BUF_SIZE]);
int cmd_battery(char args[][ARG_BUF_SIZE]);
int cmd_clock(char args[][ARG_BUF_SIZE]);
int cmd_config(char args[][ARG_BUF_SIZE]);
int cmd_debug(char args[][ARG_BUF_SIZE]);

//All aliases for commands
const char * a[] = {"h", "hlp", "hlep", NULL};
const char * b[] = {"b", "bat", NULL };
const char * c[] = {"c", "clk", "time", NULL};
const char * co[] = {"con", "cfg", "conifg", NULL};
const char * d[] = {"d", "dbg", NULL};

CMD cmds[] = {
  {
    "help", cmd_help, a
  },
  {
    "battery", cmd_battery, b
  },
  {
    "clock", cmd_clock, c
  },
  {
    "config", cmd_config, co
  },
  {
    "debug", cmd_debug, d
  }
};
```

I added a bunch of general purpose functions:

```c
int CLI_Run(){
  int ret = CMD_OK;
  char args[MAX_NUM_ARGS][ARG_BUF_SIZE];

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
```

`read_line` simply reads, well... a line from the terminal. `parse_line` simply tokenizes the input into words (using `strtok`). All pretty regular stuff.

`findCommand` is slightly more interesting:

```c
CMD * findCommand(char * command){
  if(!command || strlen(command) == 0){
    return NULL;
  }

  for(int i=0; i<num_commands; i++){
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
```

It will attempt to find the specific `CMD` by name, and if not found, it will try all aliases (if any).

Finally, if a `CMD` is found, we execute it passing along all parameters (tokenized):

```c
int executeCommand(char args[][ARG_BUF_SIZE]){  
  CMD * c = findCommand(args[0]);
  if(c){
    return (*c->cmd_handler)(args);
  }
  Serial.println("Invalid command. Type \"help\" for more.");
  return 0;
}
```

The prototype of each command is pretty straightforward too. Here's an example:

```c
int cmd_debug(char args[][ARG_BUF_SIZE]){

  if(help(args, "debug", "[on|off]. on (default): enables debug output. off:disables output.")==CMD_OK){
    return CMD_OK;
  }

  if(strlen(args[1])==0 || !strcmp(args[1], "on")){
    DebugOn();
    Serial.println("Debug is ON");
  } else {
    DebugOff();
    Serial.println("Debug is OFF");
  }
  Debug("cmd_debug completed");
  return CMD_OK;
}
```

`help` is another helper function to display ... help:

```c
int help(char args[][ARG_BUF_SIZE], const char * cmd, const char * helpString){
  if(!strncmp(args[1], "help", 4)){
    Serial.println("Usage " + String(cmd) + ". " + String(helpString));
    return CMD_OK;
  }
  return CMD_SKIP;
}
```

Another helper function evaluates possible aliases for _subcommands_:

```c
int isSubcommand(const char * subcommand, const char * options[]){
   int x = 0;
   while(options[x]){
    if(!strcmp(subcommand, options[x++])){
      return 1;
    }
   }
   return 0;
}
```

Which can be used such as in this example:

```c
int cmd_config(char args[][ARG_BUF_SIZE]){
  
  if(help(args, "config", "[ls|get|set|save|reset].\r\nls (default):returns all configuration parameters. get {param}: returns the specific value of the parameter.\r\nget {param} {value}: sets parameter value. save:saves config values to store. reset: resets configuration to defaults.")==CMD_OK){
    return CMD_OK;
  }
  
  const char * gsc[] = {"get", "g", "gte", "gp", NULL };
  if(isSubcommand(args[1], gsc)){
    char * v = Config_Get(args[2]);
    if(v){
      Serial.print(args[2]);
      Serial.print("=");
      Serial.println(v);
      return CMD_OK;
    } else {
      Serial.println("Error. Parameter [" + String(args[2]) + "] doesn't exist.");
      return CMD_ERROR;
    } 
  }
  return CMD_ERROR;
}
```

`get`, `g`, `gte` and `gp` are all equivalent.

The last interesting function is the handler for the `help` command itself:

```c
int cmd_help(char args[][ARG_BUF_SIZE]){
  if(strlen(args[1])==0){
    Serial.println("The following commands are available:");
    for(int i=0; i<num_commands; i++){
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
      Serial.println("Command not found");
      strcpy(_args[0], "help");
      strcpy(_args[1], "");
      return cmd_help(_args);
    }
    strcpy(_args[0], c->cmd_name);
    strcpy(_args[1], "help");
    return (*c->cmd_handler)(_args);
  }
}
```

If the command receives no arguments, it just prints all commands available. If an argument is passed (e.g. `help config`), it will attempt finding the command (by name or by alias). If found and it is _not_ "help", then we route to the handler with an "help" argument. So it displays the help string. If the command is not found or the help is for "help", then we just call the `cmd_help` function recursively.


