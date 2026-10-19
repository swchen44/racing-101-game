import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourcePool } from '../js/cities/resource-pool.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };

test('concurrent leases share one load and the last release disposes once', async () => {
  const pending=deferred(); let loads=0; const disposed=[];
  const pool=createResourcePool(()=>{loads++;return pending.promise;},v=>disposed.push(v));
  const a=pool.acquire('city'), b=pool.acquire('city');
  const resource={id:'taipei'}; pending.resolve(resource);
  const [one,two]=await Promise.all([a,b]);
  assert.equal(loads,1); assert.equal(one.value,two.value);
  one.release(); one.release(); assert.deepEqual(disposed,[]);
  two.release(); assert.deepEqual(disposed,[resource]);
});

test('aborting one waiter preserves a second waiter and releases an abandoned load', async () => {
  const pending=deferred(); const disposed=[];
  const pool=createResourcePool(()=>pending.promise,v=>disposed.push(v));
  const controller=new AbortController();
  const a=pool.acquire('city',{signal:controller.signal});
  const check=assert.rejects(a,{name:'AbortError'});
  const b=pool.acquire('city'); controller.abort(); await check;
  pending.resolve('resource'); const lease=await b;
  assert.deepEqual(disposed,[]); lease.release(); assert.deepEqual(disposed,['resource']);
  const late=deferred(); const abandoned=[];
  const pool2=createResourcePool(()=>late.promise,v=>abandoned.push(v));
  const c=new AbortController(); const job=pool2.acquire('city',{signal:c.signal});
  const rejection=assert.rejects(job,{name:'AbortError'}); c.abort(); await rejection;
  late.resolve('late'); await new Promise(r=>setImmediate(r));
  assert.deepEqual(abandoned,['late']);
});

test('failed loads can be retried and already-aborted requests never start', async () => {
  let calls=0; const pool=createResourcePool(async()=>{if(++calls===1)throw Error('network');return 'ok';},()=>{});
  await assert.rejects(pool.acquire('city'),/network/);
  const retry=await pool.acquire('city'); assert.equal(retry.value,'ok'); retry.release();
  const c=new AbortController();c.abort();
  await assert.rejects(pool.acquire('city',{signal:c.signal}),{name:'AbortError'});
  assert.equal(calls,2);
});
