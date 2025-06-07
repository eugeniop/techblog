---
layout: post
title: "OTA Updates for Arduino Projects - Part III"
date:   2021-10-09
categories: arduino ota
comments: true
author: Eugenio Pace
---

In this post of the "OTA Updates" series, I am covering automating the build. Until now, I've been always compiling sketches using the IDE. It works great and for this projects, I think the experience has been great, even when my project grew to +30 files.

> I've occasionally used VSCode. I like the refactoring features in it. 

But as I know deliver binaries to the device through the "air" I wanted to automate the build. Some research led me to the `arduino-cli` which works great. All things CLI are available [here](https://www.arduino.cc/pro/cli).

For my setup, the command looks like this (all conveniently packaged in a shell script):

```sh
#Set firmware version
VERSION="1.0.7"

arduino-cli compile -v -b adafruit:samd:adafruit_feather_m0 -e --build-property "compiler.cpp.extra_flags=\"-DDEVICE_VERSION=\"$VERSION\"\"" $PWD/display.ino
mv $PWD/build/adafruit.samd.adafruit_feather_m0/display.ino.bin $PWD/bin/$VERSION.BIN
cp $PWD/bin/$VERSION.BIN ~/mybackend/firmware/display
rm -rf $PWD/build

```

The `VERSION` variable gets used eventually in a `#define` (through `compiler.cpp/extra_flags`) and used in the sketch as a parameter to query for updates. The board sends the current version to the back-end so it can identify a potential new version available.

At this stage I am copying the binary file to a folder on the back-end as a static file. A better option would be to upload the binary to an S3 bucket or something like that. But that will came later.

Next part will be the actual back-end code.
