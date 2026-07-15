#!/usr/bin/env node
'use strict';
/**
 * Single entry point for the art pipeline:
 *   1. render every assets/sprites/src/*.json -> assets/sprites/*.png (+ _8x)
 *   2. build the T7 kit contact sheet (tiles/objects side by side at 8x)
 *   3. build the Nativos contact sheet (issue #23: gota/raiz/cinza + avatar)
 *   4. build the 8x8 map mock (scene-cohesion check)
 *
 * Does NOT run author-sprites.cjs / author-nativos.cjs — those are the
 * one-time/opt-in generators for the initial matrices. Once
 * assets/sprites/src/*.json exist, they are the source of truth and this is
 * the only script that needs to run again after hand-editing them.
 *
 * Usage: node assets/tools/build.cjs
 */

const { renderAll } = require('./render.cjs');
const contactSheet = require('./contact-sheet.cjs');
const contactSheetNativos = require('./contact-sheet-nativos.cjs');
const mapMock = require('./map-mock.cjs');

function run() {
  renderAll();
  contactSheet.build();
  contactSheetNativos.build();
  mapMock.build();
}

if (require.main === module) {
  run();
}

module.exports = { run };
