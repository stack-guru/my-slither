# Slither-like Backend (TypeScript)

Minimal server with a fixed 30ms tick, snakes/food world, and WebSocket updates.

## Requirements
- Node.js 18+

## Install
- npm i

## Develop
- npm run dev

## Build & Run
- npm run build
- npm start

## Protocol
- Client → Server
  - {"type":"hello","name":"Alice"}
  - {"type":"input","angle":1.57,"boost":true}
- Server → Client
  - {"type":"welcome","id":"...","world":{"width":3000,"height":3000}}
  - {"type":"state","snapshot":{...}}

## Notes
- Tick: 30ms fixed timestep (< 35ms target)
- Snapshot includes all snakes and food positions; optimize later if needed.
