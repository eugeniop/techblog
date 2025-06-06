---
layout: post
title:  "Calling Secure APIs From Arduino - Part I"
date:   2019-04-25
categories: deviceflow auth0
comments: true
author: Eugenio Pace
---

A new authentication flow is now available in Auth0, that allows devices with limited input capabilities (e.g., no keyboard or touch screens) to get an `access_token` that can be then used to call an API.

I wanted to test this with a real "limited input" device, so I've built one! 

### The *Inspirational Printer* TL;DR

The *Inspirational Printer* prints a (surprise!) inspirational message from my favorite philosophers. Every 10 seconds, it calls an API and checks if a quote is available for printing. If a quote is available, it prints it. If there's no quote, it waits another 10 seconds and tries again.

> I could have equipped the board with more intelligence for querying: a schedule, etc. but C++ is much harder than JavaScript, this board doesn't have a real-time clock, and even though I toyed with the idea of using NTP and keep a clock on board, I ended up moving all the logic to the server. The core goal was to experiment with authentication, after all.

The printer's brain is an [Arduino based board](https://www.adafruit.com/product/3010) available from Adafruit that comes with WiFi capabilities, among other goodies. It is a pretty powerful little computer!

> The board also comes with TCP and a TLS stack which is, needless to say, very convenient, as I'd instead not implement all that stuff from scratch.

The board connects to a [thermal printer](https://www.adafruit.com/product/597) (also from Adafruit) via one of the available serial ports (`Serial1`).

> `Serial` maps to the USB port you connect the Arduino to your computer. You would use this USB connection for developing and debugging.

![](/media/insp-prn.png)

### Hardware

I'm using an Arduino based board. Adafruit produces these "feather" boards with amazing pre-wired peripherals: WiFi, BLE, Storage, and many more. I wanted the smallest form factor and built-in WiFi.

The printer uses the other UART available one the board (`Serial1`). It just requires the `TX` wire because no information flows from the printer to the board (I'm not using hardware handshaking, nor I'm querying for *no more paper*).

> The printer uses quite a bit of power (it is thermal after all, so it needs to heat up). You need an external power supply capable of delivering at least 1.5 A. I bought a separate 9V, 2A power supply to be sure. I tried first with a smaller one, and printing came out not as crisp. 2 amps do the job.

### The Software Stack

All APIs (for both Authentication and Application) are REST/JSON based (using TLS). So I started by building the basic module:

#### HTTPRequest & HTTPResponse

The `HTTPRequest` class wraps some of the more basic communication APIs in Arduino: WiFi and the TCP stack:

```c++
#ifndef REQUEST_H
#define REQUEST_H

#include <SPI.h>
#include <WiFi101.h>
#include "globals.h"
#include "HTTPResponse.h"

enum CONNECTION_STATUS { CONNECTION_OK, NO_WIFI_CONNECTION, CONNECTION_FAILED };

class HTTPRequest {
  private:
    WiFiSSLClient client;
    Response response;

    typedef enum { HEADERS, BODY } HTTP_RX_STATE;

    void ParseHeader(String line){
      if(line.startsWith(F("HTTP/1.1"))){
        int i = line.indexOf(' ');
        int j = line.indexOf(' ', i+1);
        auto statusCode = line.substring(i+1, j);
        response.statusCode = atoi(statusCode.c_str());
        return;
      }
      
      if(line.startsWith(F("Content-Length"))){
        int i = line.indexOf(' ');
        auto len = line.substring(i+1);
        response.length = atoi(len.c_str());
        return;
       }
    }

    Response * processResponse(){
      //Resets the response object
      response.Reset();
      //Small delay to allow the library to catchup (it seems)
      delay(2000);
      HTTP_RX_STATE state = HEADERS;
      while (client.available()) {
        String line;
        switch(state){
          case HEADERS:
            line  = client.readStringUntil('\n');
            ParseHeader(line);
            if(line.length() == 1){ //Headers - Body separator
              state = BODY;
            }
            break;
          case BODY:
            response.data = new String(client.readString());
            break;
        }
      }
      return &response;
    }

    CONNECTION_STATUS ConnectServer(String server, int port){
      if(WiFi.status() != WL_CONNECTED){ 
        Debug(F("HTTP.Connect. No WiFi"));
        return NO_WIFI_CONNECTION; 
      }
      if(!client.connect(server.c_str(), port)){
        Debug(String(F("HTTP. Connection to server failed: ")) + server);
        return CONNECTION_FAILED;
      }
      return CONNECTION_OK;
    }

    void Debug(String s){
      Serial.println(s);  
    }
    
  public:
    HTTPRequest(){
      WiFi.setPins(8,7,4,2);      //Set for this board
      response.Reset();
    }

    int ConnectWiFi(String ssid, String password, int retries){
      int status = WiFi.status();
      if (status == WL_NO_SHIELD) {
        Debug(F("HTTP. No WiFi shield"));
        return status;
      }
      
      while(status != WL_CONNECTED){
        if(password.length() > 0){
          status = WiFi.begin(ssid, password);
        } else {
          status = WiFi.begin(ssid);  //Passwordless WiFi
        }
        if(--retries == 0){
          break;
        }
        // wait 3 seconds for connection:
        delay(5000);
      }
      Debug(String(F("HTTP. WiFi: ")) + String(status));
      return status;
    }

    int GetStatus(){
      return WiFi.status();
    }

    void DisconnectServer(){
      client.stop();
    }

    void DisconnectAll(){
      DisconnectServer();
      WiFi.disconnect();
    }

    void PrintWiFiStatus() {
      // print the SSID of the network you're attached to:
      Serial.print(F("SSID: "));
      Serial.println(WiFi.SSID());
    
      // print your WiFi shield's IP address:
      IPAddress ip = WiFi.localIP();
      Serial.print(F("IP Address: "));
      Serial.println(ip);
    
      // print the received signal strength:
      long rssi = WiFi.RSSI();
      Serial.print(F("RSSI: "));
      Serial.print(rssi);
      Serial.println(" dBm");
    }

    //POSTs a form to server
    Response * PostForm(String server, String route, int port, String access_token, String data){
      if(ConnectServer(server, port) != CONNECTION_OK){
        return NULL;
      }

      client.println("POST " + route + " HTTP/1.1");
      client.println("Host: " + server);
      if(access_token.length() > 0){
        client.println("Authorization: Bearer " + access_token);
      }
      client.println(F("Content-Type: application/x-www-form-urlencoded")); 
      client.println("Content-Length: " + String(data.length()));   
      client.println(F("Connection: close"));
      client.println();
      client.print(data);
      return processResponse();
    }

    Response * GetJSON(String server, String route, int port, String access_token){
      if(ConnectServer(server, port) != CONNECTION_OK){
        return NULL;
      }
      client.println("GET " + route + " HTTP/1.1");
      client.println("Host: " + server);
      client.println(F("Connection: close"));
      if(access_token.length() > 0){
        client.println("Authorization: Bearer " + access_token);
      }
      client.println();
      Debug("HTTP. GetJSON. Request sent");
      return processResponse();
    }

    Response * PostJSON(String server, String route, int port, String access_token, String data){
      if(ConnectServer(server, port) != CONNECTION_OK){
        return NULL;
      }

      client.println("POST " + route + " HTTP/1.1");
      client.println("Host: " + server);
      if(access_token.length() > 0){
        client.println("Authorization: Bearer " + access_token);
      }
      client.println(F("Content-Type: application/json")); 
      client.println("Content-Length: " + String(data.length()));
      client.println(F("Connection: close"));
      client.println();
      client.print(data);
      return processResponse();
    }
};
```

> This is a simple HTTPs library just for my purposes. I have *not* implemented all the HTTP methods. It is not meant to be a general purpose library.

The `Response` object is pretty simple:

```c++
#ifndef HTTP_RESPONSE
#define HTTP_RESPONSE

class Response {

  public:
    int statusCode;
    int length;
    String * data;
    
    ~Response(){
      Reset();
    };

    void Reset(){
      statusCode = 0;
      length = 0;
      if(data){
        delete data;
        data = NULL;
      }
    }

    void Debug(){
      Serial.println(String(F("Status: ")) + String(statusCode));
      if(length > 0){
        Serial.println(String(F("Content-Length: ")) + String(length));
        Serial.println(F("Data->"));
        Serial.println(*data);
        Serial.println(F("<-"));
      } else {
        Serial.println(F("No content"));
      }
    };
};
#endif
```

Now we can: 

1. Connect to WiFi
2. Send and Receive HTTPs data + control info (e.g. `Content-Length` and `StatusCode`).

#### Device flow

This other library implements the two basic operations in the [OAuth 2.0 Device Authorization Grant](https://tools.ietf.org/html/draft-ietf-oauth-device-flow-15):

1. Kick off the authorization process
2. Polls for status / completion (failure or success)

```c++
#ifndef DEVICEFLOW_H
#define DEVICEFLOW_H

#include "globals.h"
#include "HTTPRequest.h"

class DeviceFlowOptions {
  public:
    String authServer;
    String authorizationPath;
    String clientId;
    String scope;
    String tokenPath;
    String audience;
};

class DeviceFlow {
  private:
    DeviceFlowOptions * options;
    HTTPRequest * request;
    
    void CloseConnection(){
      request->DisconnectServer();
    };

    int OpenConnection(){
      return request->ConnectWiFi(WIFI_SSID, WIFI_PWD, 3);
    };

    void Debug(String s){
      Serial.println(s);
    }

  public:
    DeviceFlow(DeviceFlowOptions * options, HTTPRequest * request){
       this->options =  options;
       this->request = request;
    }

    ~DeviceFlow(){
      if(request->GetStatus() == WL_CONNECTED){
        request->DisconnectAll();
      }
    };

    Response * StartAuthorization(){
      if( OpenConnection() == WL_CONNECTED ){
        //Kicks-off Device flow auth
        String codeRequest = "client_id=" + options->clientId + "&scope=" + options->scope +"&audience=" + options->audience;
        auto * response = request->PostForm(options->authServer, options->authorizationPath, 443, "", codeRequest);
        CloseConnection();
        if(response->statusCode != 0){
          response->Debug();
        }
        return response;
      }
      Debug(F("DF.Start Connection fail"));
      return NULL;
    };

    Response * PollAuthorization(String code){
        if(OpenConnection() == WL_CONNECTED){
          String tokenRequest = "{\"grant_type\":\"urn:ietf:params:oauth:grant-type:device_code\",\"client_id\":\"" + options->clientId + "\",\"device_code\":\"" + code + "\"}";
          Debug(F("DF. Poll. POSTING:"));
          Debug(tokenRequest);
          auto * response = request->PostJSON(options->authServer, options->tokenPath, 443, "", tokenRequest);
          if(response->statusCode != 0){
            response->Debug();
            return response;
          }
        }
        Debug(F("DF.Poll Connection fail"));
        return NULL;
    };
};
#endif
```

`DeviceFlow` relies on `HTTPRequest` of course (and `Response`).

> Notice that `StartAuthorization` uses `PostForm` and `PollAuthorization` uses `PostJSON`. Auth0 supports both `Content-Types` (although the standard specifies Forms). Forms are easier to build in C++, but I wanted to experiment with both.

#### Authenticator

The `Authenticator` class is another abstraction that wraps the entire authentication process:

1. Starts the login process (using `DeviceFlow`)
2. Prints information to the user needed to complete login (the `code` and URL)
3. Polls for completion
2. Keeps track of the `access_token`
3. (In the future) obtain new `access_tokens` via `refresh_tokens`

```c++
#ifndef AUTH_H
#define AUTH_H

#include "Arduino.h"
#include "DeviceFlow.h"
#include "ArduinoJson.h"
#include "Printer.h"
#include "HTTPRequest.h"
#include "activate.h"

enum AUTHENTICATION_STATUS { AUTH_OK, AUTH_START_FAILED, AUTH_TOKEN_FAILED };

class Authenticator {

  Printer * printer;
  HTTPRequest * request;

  DeviceFlowOptions options = {
    AUTHZ_SERVER, //authServer
    AUTHZ_PATH, //authorizationPath
    CLIENT_ID, //clientId
    SCOPE, //scope
    TOKEN_PATH, //tokenPath
    AUDIENCE //audience
  };

  String * accessToken;

  DynamicJsonDocument * ParseJSON(String * input){
    auto JSON = new DynamicJsonDocument(MAX_AUTHZ_DOC);
    DeserializationError err = deserializeJson(*JSON, input->c_str());
    if(err){
      Debug(F("A.ParseJSON. Error:"));
      Debug(err.c_str());
      delete JSON;
      return NULL;
    }
    return JSON;
  };

  void Debug(String s){
    Serial.println(s);
  }

  int isSlowDown(const char * error){
    return 0 == strcmp(error, "access_denied");
  }

  int isAuthorizationPending(const char * error){
    return 0 == strcmp(error, "authorization_pending");
  }
  
 public:

  Authenticator(HTTPRequest * req, Printer * printer){
    this->request = req;
    this->printer = printer;
  }

  int IsTokenAvailable(){
    return (accessToken && accessToken->length());
  }

  const char * GetAccessToken(){
    if(accessToken){
      return accessToken->c_str();
    }
    return NULL;
  }

  void InvalidateToken(){
    if(accessToken){ 
      delete accessToken;
    }
    accessToken = NULL;
  }
  
  AUTHENTICATION_STATUS Authenticate(){
    DeviceFlow df(&options, request);
    auto res = df.StartAuthorization();
    if(!res){
      Debug(F("Auth. Start Failed"));
      return AUTH_START_FAILED;
    }
  
    if(200 != res->statusCode){
      Debug(String(F("Auth. Start failed with code: ")) + String(res->statusCode));
      return AUTH_START_FAILED;
    }

    auto * authzJSON = ParseJSON(res->data);
    if(!authzJSON){
      return AUTH_START_FAILED;
    }
  
    const char * verification_url_complete = (*authzJSON)["verification_uri_complete"];
    const char * user_code = (*authzJSON)["user_code"];

    printer->SetSize('S');
    printer->Justify('L');
    printer->PrintLn("Please visit this URL: " + String(verification_url_complete));
    printer->Feed(1);
    printer->PrintLn(F("If prompted, please enter this code when prompted:"));
    printer->SetSize('L');
    printer->Justify('C');
    printer->Print(String(user_code));
    printer->Feed(1);
    printer->PrintBitmap(activate_width, activate_height, activate_data);
    printer->Feed(4);
    
    char device_code[MAX_DEVICE_CODE];
    strcpy(device_code, (*authzJSON)["device_code"]);
    
    auto interval = (*authzJSON)["interval"].as<int>() * 1000;  //convert to ms
    delete authzJSON;

    int hard_retries = 5;

    while(hard_retries){
      delay(interval ? interval : 5000);
      res = df.PollAuthorization(device_code);

      if(!res){
        Debug(F("Auth. Poll failed"));
        hard_retries--;
        if(hard_retries==0){
          return AUTH_TOKEN_FAILED;
        }
      } else {
        //A 200 means "success" and authentication is complete.
        if(200 == res->statusCode){
          //User authentication completed. Extract access_token
          auto * authJSON = ParseJSON(res->data);
          if(!authJSON){
            return AUTH_TOKEN_FAILED;
          }
  
          //Extract access_token
          this->accessToken = new String((const char *)(*authJSON)["access_token"]);
          delete authJSON;
          return AUTH_OK;
        }
        
        //Anything else from 200 or 403 is a failure. Return with error.
        if(res->statusCode != 403){
          //Anything other than a 403 is a failure
          Debug(String(F("Auth. Failed: ")) + String(res->statusCode));
          return AUTH_TOKEN_FAILED;
        }
  
        /* 403 means many things. response.data.error provides more info:
         *  authorization_pending: continue polling.
         *  slow_down: polling is happening too fast.
         *  access_denied: user cancelled.
         *  expired_token: the flow is expired. Try again the whole thing.
         *  invalid_grant: code is invalid
         */
         auto * authJSON = ParseJSON(res->data);
         const char * error = (*authJSON)["error"];
         delete authJSON;
         
         if(isAuthorizationPending(error)){
          //Just wait
          Debug(F("Authenticate. Authorization Pending"));
         } else {
          if(isSlowDown(error)){
            Debug(F("Authenticate. Polling too fast"));
            interval += 2000; //Add 2 seconds to polling
          } else {
            //Any other error is final
            Debug("Authenticate. Error:" + String(error));
            return AUTH_TOKEN_FAILED;        
          }
        }
      }
    }   
    return AUTH_TOKEN_FAILED;
  }
};
#endif
```

Why a separate class? Why not merge `DeviceFlow` and `Authenticator`? I guess I could, but I wanted to keep all the logic of interacting with the user separate from the protocol. That's it.

#### Printer

The `Printer` class encapsulates operations on the actual printer. Only I wanted to have 2 different implementations:

1. A "Mock" printer that would output to the `Serial` port (connected to the USB of the host computer).
2. The real thermal printer (which is not that comfortable to wire up on a plane by the way. A lot of this, I developed while traveling).

> Using the "Mock" allows me to develop without the burden of cables, power supply, protoboard, and others. Just a USB cable and the Arduino.

```c++
cl#ifndef PRINTER_H
#define PRINTER_H

#include "Arduino.h"
#include <Adafruit_Thermal.h>

#ifndef MOCK_PRINTER
class Printer {
  Adafruit_Thermal * printer;
  public:
    Printer(Stream * stream){
      printer = new Adafruit_Thermal(stream);      
    }

    ~Printer(){
     //delete printer;
    }

    void Init(){
      printer->begin();
    }
    
    void Print(String s){
      printer->print(s);
    }

    void Print(char c){
      printer->write(c);
    }

    void PrintLn(String s){
      printer->println(s);
    }

    void SetSize(char s){
      printer->setSize(s);
    }

    void Justify(char c){
      printer->justify(c);
    }

    void Feed(int lines){
      printer->feed(lines);
    }
    
    void PrintBitmap(int width, int height, const unsigned char * qrcode){
      printer->printBitmap(width, height, qrcode);
    }
};  

#else

//Mock Printer that uses the Serial Port.
class Printer {
  public:
    Printer(){
    }
  
    void Print(String s){
      Serial.print(s);
    }

    void Print(char c){
      Serial.write(c);
    }

    void Justify(char c){
      //NoOp
    }

    void Feed(int lines){
      for(int i=0; i<lines; i++){
        Serial.write('\n');  
      }
    }

    void PrintBitmap(int w, int h, const unsigned char * bmp){
      Serial.println("Width: " + w);
      Serial.println("Height: " + h);
   }
};
#endif
#endif
```

Defining `MOCK_PRINTER` excludes or includes one class or the other.

> On second thoughts I'm not sure I need this additional abstraction. I can probably simplify and wire up the actual `Adafruit_Thermal` class, and use a mock with the same name and signatures, but here we are. In my very first implementation, muscle memory made me write an abstract class (as an interface) and 2 concrete implementations. Completely unnecessary.

The actual printer has many commands besides the above. However, that's all I need for now.

> All the hard work of actual printing is taken care of by the excellent [Adafruit_Thermal library](https://github.com/adafruit/Adafruit-Thermal-Printer-Library).

And finally...

#### Quotes

The `Quotes` class is the wrapper for the API. It relies both on `Authenticator` and `Printer`.

There's one important method in the class: `Print`:

```c++
void Print(){
    auto quote = GetQuote();
    if(quote){
      const char * text = (*quote)["quote"];
      const char * author = (*quote)["author"];
      printer->Feed(1);
      printer->Justify('L');
      printer->Print('\"');
      printer->Print(text);
      printer->Print(author); 
      printer->Print('\"');
      printer->Print('\n');
      printer->Print(author);
      printer->Feed(1);
      delete quote;
      return;
    }
  }
```

`GetQuote` returns a `DynamicJsonDocument` with a quote:

```json
{
  "text": "The impediment to action advances action. What stands in the way, becomes the way",
  "author": "Marcus Aurelius"
}
```

> [ArduinoJson](https://arduinojson.org/) is a fantastic library that significantly simplifies parsing of JSON docs in C++.

#### Tying all together

The main program connects all components:

```c++
#include "Arduino.h"
#include "Authenticator.h"
#include "Quotes.h"
#include "Printer.h"
#include "HTTPRequest.h"
#include "activate.h"

Printer printer(&Serial1);
HTTPRequest request;
Authenticator auth(&request, &printer);
Quotes quotes(&request, &auth, &printer);

void WaitKey(){
  while(Serial.available() <= 0 ){
    delay(200);
  }
  
  while( Serial.available() > 0 ){
    int c = Serial.read();
  }
  return;
}

void setup() {
  Serial1.begin(19200);
  Serial.begin(9600);
  while (!Serial) {
    ; // Wait fr USB
  }

  while(!Serial1){
    ; //Wait on Printer
  }

  printer.Init();
}

void loop(){  
  if(!auth.IsTokenAvailable()){
    int r = auth.Authenticate();
    printer.Justify('L');
    printer.SetSize('S');
    if(r != AUTH_OK){
      printer.Print("Authentication failed. Please try again!");
    } else {
      printer.Print("Your printer is ready!");
    }
    printer.Feed(2);
    return;
  }
  
  quotes.Print();
  delay(20000);
}
```

How does it work?

After initialization we:

1. Check if an `access_token` is available.
2. If available, print the quote.
2. If no token is available, then we trigger the authentication process.

### Sequence of Events

![](/media/mermaid-diagram-20190517114136.svg)

### Quirks and caveats

The board only has 2KB of RAM. You would be surprised how fast that amount runs out. By being careless, I ran into a couple of issues. When this happens, the board hangs and enters into a weird state.

All the strings surrounded with the `F("...")` macro are meant to save as much memory as possible. There's a good explanation of how it works [here](https://www.arduino.cc/reference/en/language/variables/utilities/progmem/). [This other doc](https://learn.adafruit.com/memories-of-an-arduino) gives a more comprehensive description of memory on Arduino devices.

> Arduino uses _hybrid Harvard_ architecture, in which program memory and data memory are separate.

I tried to minimize the use of dynamic memory allocation (using `new`/`malloc`). `delete`/`free` are easy to forget. Memory leaks in 2KB RAM system are very evident, very quikcly!

> I left my prototype running all night. It was still working the next day. Win!

### Next episode

In my next post, I describe the backend API for this. Primarily I've built a simple "printer queue".