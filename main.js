/**
 * main.js — entry point. Loads .env, connects to the game, starts the agent.
 *
 * Run it with:   npm start
 * (which is just `node main.js`). Make sure you've copied .env.example to .env
 * and filled in HOST and TOKEN first.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { DjsConnect } from '@unitn-asa/deliveroo-js-sdk/client';
import { Agent } from './src/agent.js';

// Always load the .env that sits next to THIS file (the root .env), no matter
// which folder you start from. override:true = .env beats any old TOKEN/HOST
// left over in the terminal session.
dotenv.config({
  path: fileURLToPath(new URL('.env', import.meta.url)),
  override: true,
});

// DjsConnect reads HOST / TOKEN / NAME from the environment by default, so the
// values in your .env are picked up automatically.
const socket = DjsConnect(
  process.env.HOST,
  process.env.TOKEN,
  process.env.NAME,
);

socket.onConnect(() => console.log('Connected — starting agent.'));
socket.onDisconnect((reason) => console.log('Disconnected:', reason));

const agent = new Agent(socket);
agent.run().catch((err) => {
  console.error('Agent crashed:', err);
  process.exit(1);
});
