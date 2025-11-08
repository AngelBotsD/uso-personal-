"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.proto = exports.makeWASocket = exports.callOffer = exports.callEnd = exports.callAccept = exports.callReject = exports.listenCalls = void 0;
const WAProto_1 = require("../WAProto");
Object.defineProperty(exports, "proto", { enumerable: true, get: function () { return WAProto_1.proto; } });
const Socket_1 = __importDefault(require("./Socket"));
exports.makeWASocket = Socket_1.default;

async function callOffer(sock, to, isVideo = false, duration = 10000) {
  const id = Date.now().toString()
  const content = [
    { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
    { tag: 'net', attrs: { medium: '3' } },
    { tag: 'encopt', attrs: { keygen: '2' } }
  ]
  if (isVideo) content.push({ tag: 'video', attrs: { orientation: '0', enc: 'vp8', dec: 'vp8' } })
  const node = {
    tag: 'call',
    attrs: { to: to.includes('@s.whatsapp.net') ? to : to + '@s.whatsapp.net', id },
    content: [
      {
        tag: 'offer',
        attrs: {
          'call-id': id,
          'call-creator': sock.user.id
        },
        content
      }
    ]
  }
  await sock.query(node)
  setTimeout(async () => {
    await callEnd(sock, to, id)
  }, duration)
  return id
}

async function callEnd(sock, to, callId) {
  const node = {
    tag: 'call',
    attrs: { to: to.includes('@s.whatsapp.net') ? to : to + '@s.whatsapp.net', id: Date.now().toString() },
    content: [
      {
        tag: 'terminate',
        attrs: {
          'call-id': callId,
          'call-creator': sock.user.id
        }
      }
    ]
  }
  await sock.query(node)
  return true
}

async function callAccept(sock, from, callId, isVideo = false) {
  const content = [
    { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
    { tag: 'net', attrs: { medium: '3' } },
    { tag: 'encopt', attrs: { keygen: '2' } }
  ]
  if (isVideo) content.push({ tag: 'video', attrs: { orientation: '0', enc: 'vp8', dec: 'vp8' } })
  const node = {
    tag: 'call',
    attrs: { to: from, id: Date.now().toString() },
    content: [
      {
        tag: 'accept',
        attrs: {
          'call-id': callId,
          'call-creator': from
        },
        content
      }
    ]
  }
  await sock.query(node)
  return true
}

async function callReject(sock, from, callId) {
  const node = {
    tag: 'call',
    attrs: { to: from, id: Date.now().toString() },
    content: [
      {
        tag: 'reject',
        attrs: {
          'call-id': callId,
          'call-creator': from
        }
      }
    ]
  }
  await sock.query(node)
  return true
}

function listenCalls(sock, autoAction = 'reject') {
  sock.ev.on('call', async (call) => {
    const data = call[0]
    if (!data) return
    const from = data.from
    const id = data.id
    if (data.status === 'offer') {
      console.log(`📞 Llamada entrante de ${from}`)
      if (autoAction === 'accept') {
        await callAccept(sock, from, id)
        console.log(`✅ Llamada aceptada de ${from}`)
      } else if (autoAction === 'reject') {
        await callReject(sock, from, id)
        console.log(`❌ Llamada rechazada de ${from}`)
      } else {
        console.log(`⚠️ Esperando acción manual para la llamada de ${from}`)
      }
    }
  })
}

exports.callOffer = callOffer
exports.callEnd = callEnd
exports.callAccept = callAccept
exports.callReject = callReject
exports.listenCalls = listenCalls

__exportStar(require("../WAProto"), exports);
__exportStar(require("./Utils"), exports);
__exportStar(require("./Types"), exports);
__exportStar(require("./Store"), exports);
__exportStar(require("./Defaults"), exports);
__exportStar(require("./WABinary"), exports);
__exportStar(require("./WAM"), exports);
__exportStar(require("./WAUSync"), exports);
exports.default = Socket_1.default;
