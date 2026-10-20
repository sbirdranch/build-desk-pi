import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {clientId} from '../src/core/client-id';

test('client save and purchasing IDs work with HTTP crypto that has no randomUUID',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:webcrypto.getRandomValues.bind(webcrypto)}});
 try{
  assert.equal(typeof globalThis.crypto.randomUUID,'undefined');
  const ids=Array.from({length:128},()=>clientId());
  assert.equal(new Set(ids).size,ids.length);
  for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 }finally{if(previous)Object.defineProperty(globalThis,'crypto',previous);else Reflect.deleteProperty(globalThis,'crypto')}
});

test('a browser without a random source reports an actionable error',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined});
 try{assert.throws(()=>clientId(),/cannot create save IDs/)}
 finally{if(previous)Object.defineProperty(globalThis,'crypto',previous);else Reflect.deleteProperty(globalThis,'crypto')}
});
