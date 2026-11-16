import test from 'node:test';
import assert from 'node:assert/strict';
import {access,secret} from '../src/access.js';
test('authentication, separate capabilities and bounded rate windows',()=>{
 let time=0;const authorize=access('r'.repeat(32),'w'.repeat(32),3,1000,()=>time);
 assert.equal(authorize(undefined,'read').status,401);
 assert.equal(authorize('Basic '+ 'r'.repeat(32),'read').status,401);
 assert.equal(authorize('Bearer '+'r'.repeat(32),'write').status,403);
 assert.equal(authorize('Bearer '+'r'.repeat(32),'read').status,200);
 assert.equal(authorize('Bearer '+'r'.repeat(32),'read').status,200);
 assert.equal(authorize('Bearer '+'r'.repeat(32),'read').status,429);
 assert.equal(authorize('Bearer '+'w'.repeat(32),'write').status,200);
 time=1000;assert.equal(authorize('Bearer '+'r'.repeat(32),'read').status,200);
 assert.throws(()=>access('same','same'));
 assert.throws(()=>access('a','b',NaN));
});
test('secret configuration fails closed without exposing values',()=>{
 assert.throws(()=>secret('KEY',{}));
 assert.throws(()=>secret('KEY',{KEY:'short'}));
 assert.throws(()=>secret('KEY',{KEY:'x'.repeat(32),KEY_FILE:'unused'}));
 assert.equal(secret('KEY',{KEY:'x'.repeat(32)}),'x'.repeat(32));
});
