---
layout: post
title:  "Pixelator co-written with OpenAI - Part II"
date:   2023-09-03
categories: openai lego
comments: true
author: Eugenio Pace
---

This is Part II of my AI written mosaic generator in which I describe the algorithm I used to create the tiles. (Part I is described [here](/post/2023-08-14-An-OpenAI-written-pixelator.md)).

The approach is pretty simple. Credit for describing how to generate goes to me! The actual code to do it, goes 95% to OpenAI. My 5% was some tweaking here and there.

The assumption is that the input image being processed contains a lot more pixels than the tiles. So the algorithm I came up with works like this:

1. Divide the original picture into sections equal to a tile and find all pixels in that tile.
2. Compute the `average` color of all pixels in such tile (each pixel is modeled with 3 integers, representing the RGB values).
3. Compute the closest color in a given palette to the average.
4. Add the resulting palette color (also 3 integers for RGB) into an output array.

* Step 2 is accomplished by simply adding all `R`, `G` and `B` and dividing by number of pixels in a tile.
* Step 3 is a little bit more interesting, but simple too. I am just using the *Euclidean* distance of the average to all palette reference colors:

`D = SQRT( (Ri - Rp)^2 + (Gi - Gp)^2 + (Bi - Bp)^2 )`

`Ri`, `Gi`, and `Bi` is the input (average) color. `Rp`, `Gp`, and `Bp` is the `RGB` value of the reference palatte. And I am comparing it to all values in the palette. *Gray scale* is 16. *Lego* is about 227 and *Prisma* is 150. In any case, it is pretty fast...

The complete module looks like this:

```js
const sharp = require('sharp');
const getPixels = require('get-pixels');

const lego_colors = require('./lego_colors.json');
const crayola_colors = require('./crayola_colors.json');
const prisma_colors = require('./prisma_colors.json');
const grayscale_colors = {};

grayscale_colors.color_list = Array.from({ length: 16 }, (_, i) => {
    const value = Math.floor((i / 15) * 255);
    const hex = value.toString(16).padStart(2, '0');
    return {
        color: `gray_${hex}`,
        hex: `#${hex}${hex}${hex}`
    };
});

function hexToRgb(hex) {
    // Ensure the hex string has 6 characters
    if (hex.charAt(0) === '#') {
        hex = hex.substring(1);
    }

    // Parse the hex string and return the RGB values
    return [
        parseInt(hex.substring(0, 2), 16),
        parseInt(hex.substring(2, 4), 16),
        parseInt(hex.substring(4, 6), 16)
    ];
}

function findClosestColor(inputColor, colorArray) {
    let minDistance = Infinity;
    let closestColor = null;

    for (let i = 0; i < colorArray.length; i++) {
        let ref_color = hexToRgb(colorArray[i].hex);
        let redDiff = ref_color[0] - inputColor[0];
        let greenDiff = ref_color[1] - inputColor[1];
        let blueDiff = ref_color[2] - inputColor[2];

        let distance = Math.sqrt(Math.pow(redDiff, 2) + Math.pow(greenDiff, 2) + Math.pow(blueDiff, 2));

        if (distance < minDistance) {
            minDistance = distance;
            closestColor = i;
        }
    }

    return colorArray[closestColor];
}

exports.processImageToGrid = (image, type, palette, gridWidth, gridHeight) => {
    return new Promise((resolve, reject) => {
        getPixels(image, type, (err, pixels) => {
            if(err){
                reject(err);
                return;
            }
            // Get the size of the original image
            const width = pixels.shape[0];
            const height = pixels.shape[1];

            if(width < gridWidth || height < gridHeight){
                reject(new Error('Image is too small'));
                return;
            }

            // Calculate the size of the cells in the grid
            const cellWidth = Math.floor(width / gridWidth);
            const cellHeight = Math.floor(height / gridHeight);

            // Create an array for the output image data
            let outputImage = [];
            let inventory = []; //Used for the color inventory
            let colorSequence = []; //Used for the instructions
            let lastColorName = null;

            //All available palette 
            let list = {
                crayola: crayola_colors.color_list,
                lego: lego_colors.color_list,
                grayscale: grayscale_colors.color_list,
                prisma: prisma_colors.color_list
            };

            for (let j = 0; j < gridHeight; j++) {
                lastColor = null;
                for (let i = 0; i < gridWidth; i++) {
                
                    // Initialize the sum for each color component
                    let sumR = 0, sumG = 0, sumB = 0;

                    // Calculate the average color of the cell
                    for (let y = j * cellHeight; y < (j + 1) * cellHeight; y++) {
                        for (let x = i * cellWidth; x < (i + 1) * cellWidth; x++) { 
                            // Get the color components of the pixel
                            const r = pixels.get(x, y, 0);
                            const g = pixels.get(x, y, 1);
                            const b = pixels.get(x, y, 2);

                            // Add the color components to the sum
                            sumR += r;
                            sumG += g;
                            sumB += b;
                        }
                    }

                    // Calculate the average color
                    const avgR = Math.round(sumR / (cellWidth * cellHeight));
                    const avgG = Math.round(sumG / (cellWidth * cellHeight));
                    const avgB = Math.round(sumB / (cellWidth * cellHeight));

                    const out_color = findClosestColor([avgR, avgG, avgB], list[palette || "lego"]);

                    //Add the average color to the output image data
                    outputImage.push(...hexToRgb(out_color.hex));
                    
                    //compute distribution
                    let color = inventory.find(c => c.color === out_color.color);
                    if(!color){
                        inventory.push({ 
                                          color: out_color.color, 
                                          hex: out_color.hex, 
                                          count: 1 
                                       });
                    } else {
                        color.count++;
                    }

                    //Add to color sequence
                    if(!colorSequence[j]){
                        colorSequence[j] = [];
                        colorSequence[j].push({ color: out_color.color, hex: out_color.hex, count: 1 });
                        lastColorName = out_color.color;
                    } else {
                        //same row
                        if(lastColorName !== out_color.color) {
                            colorSequence[j].push({ color: out_color.color, hex: out_color.hex, count: 1 });
                            lastColorName = out_color.color;
                        } else {
                            colorSequence[j][colorSequence[j].length - 1].count++;
                        }
                    }
                }
            }

            sharp(Buffer.from(outputImage), 
                    { 
                        raw: { 
                            width: gridWidth, 
                            height: gridHeight, 
                            channels: 3 
                        } 
                    })
                .png()
                .toBuffer()
                .then(data => {
                    const base64Image = `data:image/png;base64,${data.toString('base64')}`;
                    resolve(
                        {
                            imageRaw: outputImage,
                            image: base64Image,
                            instructions: colorSequence,
                            inventory: inventory
                        }
                    );
                })
                .catch(err => reject(err));
        });
    });
}
```

Using the `get-pixels` and `sharp` modules was OpenAI idea and it simplifies things quite a bit. There are many optimization opportunities. For example, `hexToRgb` is called on the palette reference values (which are ... duh... reference!). All this can be pre-computed. Other values that are computed on each loop, could also be pre-computed. But in my quick and dirty experiments, it is pretty fast anyway; amd I'd rather spend the time pinting now or building legos.
