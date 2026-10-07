'use strict';
const fs = require('fs');
const path = require('path');
const seed = require('./seed');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'db.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    cache = seed();
    save();
  }
  return cache;
}

let saveTimer = null;
function save() {
  if (process.env.DB_ASYNC_SAVE === '0') return flush();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 10);
}
function flush() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function reset() {
  cache = seed();
  save();
  return cache;
}

module.exports = { load, save, flush, reset, DB_PATH };
