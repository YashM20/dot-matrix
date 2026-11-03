# Make your first card

<!-- VISUAL: kind=shot · what=editor desktop layout with level-03 and an untitled frame · notice=left layer tree, central dot canvas, right DESIGN panel with the DOTS sliders -->

Click MAKE in the top bar, or open `?make` in your browser. You get an infinite canvas covered in faint dots. The tool group sits at the top left with six tools: Move (`V`), Hand (`H`), Frame (`F`), Draw (`B`), Text (`T`) and Code (`C`). The left panel has two tabs, LAYERS and ASSETS. The right panel has four: DESIGN, ANIMATE, CODE and EXPORT.

## Make a blank frame

<!-- VISUAL: kind=steps · what=frame creation with the F tool · notice=a click drops a 144 × 144 cell tile, a drag sizes the frame in whole cells -->

Press `F` to pick the Frame tool. Click once on the canvas to drop a square tile 144 cells wide and 144 cells tall, or drag a box to choose the size yourself. A dragged frame's size snaps to whole cells. Each cell is 2.25 px across at 100% zoom.

The FRAME section of the DESIGN tab shows the frame's NAME, its X and Y position, a SIZE menu of preset grids, and its COLS and ROWS. Type new numbers into any of them to move or resize the card.

## Add a live field layer

<!-- VISUAL: kind=card · what=ir-ripple · notice=concentric rings of dots fading toward the card edge on a 3× lattice -->

Press `C` to pick the Code tool, then click inside your frame. The editor adds a code layer to the card and opens the CODE tab on the right. The `+ CODE LAYER` button in the DESIGN and CODE tabs does the same thing.

The new layer is already running. Its program is one line:

```
.5 + .5 * sin(u * 12 + v * 4 - t * 2)
```

It draws diagonal bands that slide across the card. The editor compiles the program into a function of `u`, `v` and `t`. `u` goes from 0 at the left edge to 1 at the right edge, `v` from 0 at the top to 1 at the bottom, and `t` counts seconds. Every dot takes its brightness from this formula. If you click empty canvas with the Code tool instead, you get a new frame running the ripple example: rings that leave the center and fade toward the edge.

## Set tone and dot shape

<!-- VISUAL: kind=diagram · what=squircle roundness slider from r=0 to r=1 · notice=circle at n=2, the default r=0.1 at n=2.3, squarer dots as n climbs to 32 -->

Click your frame in the layer list and look at the DOTS section of the DESIGN tab.

The ROUNDNESS slider changes the dot shape. The engine draws each dot as a superellipse with exponent n = 2 + 30r², and the slider shows n as you drag. At 0 the dots are circles. A new frame starts at 0.1, a circle with slightly flattened sides. At 1 the exponent is 32 and the dots look square.

The sampler rounds smooth values into a few dot sizes. The QUANTIZE slider sets how many, and it defaults to 5. It sits in the "Dot size & texture" fold under DOT SIZE and DENSITY.

Click your code layer to pick its tone. There are seven: `auto`, `value`, `mid`, `idle`, `faint`, `active` and `activeDim`. A new code layer starts on `auto`. `active` paints dots in the accent color, Signal Red (`#FF3B30`) by default, and `activeDim` is its darker partner. Use the accent for one thing per card.

## Edit directly on the canvas

<!-- VISUAL: kind=shot · what=canvas selection handles and floating quick bar · notice=red sweep handle on a ring, quick bar with TONE and the lattice − and + buttons -->

Press `V` to switch back to the Move tool and click your frame. Handles appear at the four corners. Drag one to resize the card in whole cell steps, from 8 to 512 cells a side. When you drag the top or left corner, text layers and placed dots shift with it so they stay put on screen.

Click directly on lit dots to select a layer. A selected ring layer gets handles on the circle itself: drag the radius handle to change its size, and drag the red sweep handle to change the arc length. The sweep snaps to the ring's own dots.

A floating quick bar sits above the selected layer. Tap `TONE` to step to the next tone (hold Shift for the one before). The `−` and `+` buttons on either side of the lattice number make the dot spacing finer or coarser. A coarser lattice places bigger dots further apart, like the displays on real lab gear.

## Type text in place

<!-- VISUAL: kind=steps · what=typing DOTS with the T tool · notice=5 × 7 glyphs drawn on a 2× lattice with a red caret between letters -->

Press `T` to pick the Text tool, then click inside your frame. An invisible input catches your keys, and the letters appear on the card as you type.

They are drawn in dots with the 5 by 7 hardware font on a 2× lattice. Text turns to uppercase and stops at 64 characters. A thin red caret marks where you are typing. Click inside the text to move it. Press Enter or click somewhere else when you are done, and the whole edit is saved as one undo step. Press Escape to cancel.

## Share your card as a link

<!-- VISUAL: kind=steps · what=top bar SHARE button and the EXPORT link panel · notice=the share URL with its packed d= payload -->

Click `SHARE` near the right end of the top bar.

With frames selected, or nothing selected, the editor turns the cards into JSON, compresses it with DEFLATE and writes the result as base64 in the link's query string (`?make&d=...`). The packed part can be up to 12,000 characters. If your cards need more, there is no link, and the EXPORT tab opens with a note saying how long it would have been. With a single code layer selected, SHARE makes a shorter program link instead, which carries only the code, grid, lattice and tone.

The link is copied to your clipboard. If the browser won't allow that, the EXPORT tab opens on LINK so you can copy it by hand.

Paste the link into another tab to test it. The site unpacks it and adds the cards to the canvas, with their layers, programs and animation timeline.

## Build cards on a phone

<!-- VISUAL: kind=shot · what=phone layout with floating dock and bottom sheet · notice=44 px touch targets, bottom dock with tool buttons, sheet at the 60% detent -->

On a phone, MAKE is in the bottom tab bar, and the canvas fills the screen. A small top bar holds a back button (when there is somewhere to go back to), the card name, undo, redo, the zoom level, a `+` button to insert from assets, and SHARE.

A floating dock sits at the bottom. The layers button is on the left, the tool buttons (`V`, `F`, `B`, `T`, `C`) are in the middle, and the inspector button is on the right. Every button is at least 44 pixels across. Drag one finger on empty canvas to pan, and pinch with two fingers to zoom.

Tap the inspector button to open the bottom sheet. It has three heights: 36%, 60% and 90% of the screen. Drag or tap the handle at the top to change it. The editor remembers the height you pick for each panel and tab, and the CODE tab opens at 90% the first time.

## Use mobile selection and gestures

<!-- VISUAL: kind=steps · what=long press menu and native share sheet on a phone · notice=selection bar above the dock with DUP and DEL, the system share sheet -->

The selection bar sits just above the dock with seven buttons: `SELECT`, `ALL`, `DUP`, `GROUP`, `COPY`, `PASTE` and `DEL`. `GROUP` turns into `UNGRP` when the selection is already a group. Tap `SELECT` to turn on multi-select: each tap then adds a card to the selection or removes it, and a drag on empty canvas draws a selection box instead of panning.

With the Move tool, hold your finger still on a card for half a second (500 ms). A menu opens at your finger with six commands: `DUPLICATE`, `FORWARD`, `BACKWARD`, `TO FRONT`, `TO BACK` and `DELETE`. Each one is a single undo step.

To share from your phone, tap `SHARE` in the top bar. If the browser supports `navigator.share`, your phone's own share sheet opens, so you can send the link to Messages, Mail or AirDrop. If it doesn't, the link is copied to the clipboard instead.
