export const dashboard=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RelayLab · Delivery monitor</title>
<style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#0b1220;color:#e5edf9}*{box-sizing:border-box}body{margin:0}main{max-width:1160px;margin:auto;padding:48px 24px}.eyebrow{color:#7dd3fc;letter-spacing:.16em;font-size:12px;font-weight:700}h1{font-size:clamp(26px,4vw,40px);letter-spacing:-.04em;margin:12px 0}p{color:#9baec8;line-height:1.6}.tag{display:inline-block;border:1px solid #33465e;border-radius:6px;padding:5px 9px;color:#9baec8;font-size:12px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0}.stat{background:#121f32;border:1px solid #24344a;border-radius:12px;padding:20px}.stat strong{display:block;font-size:30px;margin:8px 0}.stat span{font-size:13px;color:#9baec8}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:24px 0 12px}select{background:#16263c;color:#e5edf9;border:1px solid #48607e;padding:10px;border-radius:8px}.table-wrap{overflow-x:auto;border:1px solid #26374e;border-radius:12px}table{border-collapse:collapse;width:100%;text-align:left;font-size:13px}th{background:#152237;color:#9baec8;padding:15px}td{padding:15px;border-top:1px solid #26374e}code{font-size:12px}.state{color:#7dd3fc}.delivered{color:#86efac}.dead{color:#fda4af}.notice{padding:30px;background:#152237;border-radius:12px}footer{margin-top:30px;color:#8295af;font-size:12px}@media(max-width:600px){main{padding:28px 16px}.stats{grid-template-columns:repeat(2,1fr)}.stat{padding:14px}.toolbar{align-items:flex-start;flex-direction:column}}
</style></head><body><main>
<div class="eyebrow">RELAYLAB / OPERATIONS</div><h1>RelayLab · Delivery monitor</h1>
<p>Follow delivery state, retries and dead letters in your local webhook lab.</p><span class="tag">DEVELOPMENT BUILD · LOCAL USE</span>
<form id="access"><label>Read token <input id="token" type="password" autocomplete="off" required></label> <button>Connect</button> <button id="disconnect" type="button">Disconnect</button></form>
<p>Token stays in memory until disconnect or reload. Use the read credential only.</p>
<section class="stats" aria-label="Latest 100 event counts">
<div class="stat"><span>Pending</span><strong id="count-pending">—</strong></div>
<div class="stat"><span>Processing</span><strong id="count-processing">—</strong></div>
<div class="stat"><span>Delivered</span><strong id="count-delivered">—</strong></div>
<div class="stat"><span>Dead letters</span><strong id="count-dead">—</strong></div></section>
<div class="toolbar"><p id="status" role="status">Connecting…</p><label>Show <select id="filter"><option value="all">All states</option><option>pending</option><option>processing</option><option>delivered</option><option>dead</option></select></label></div>
<div id="events" aria-live="polite"></div>
<footer>Latest 100 events · Refreshes every 2 seconds · At-least-once delivery · Times shown in your timezone</footer>
<script>
let rows=[],token="";
const events=document.getElementById('events'),filter=document.getElementById('filter');
function render(){
 for(const state of ['pending','processing','delivered','dead'])document.getElementById('count-'+state).textContent=String(rows.filter(x=>x.state===state).length);
 const visible=rows.filter(x=>filter.value==='all'||x.state===filter.value);events.replaceChildren();
 if(!visible.length){const empty=document.createElement('p');empty.className='notice';empty.textContent='No events in this view';events.append(empty);return;}
 const wrap=document.createElement('div');wrap.className='table-wrap';const table=document.createElement('table');
 const head=table.createTHead().insertRow();for(const label of ['Event ID','State','Attempts','Scheduled time']){const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);}
 const body=table.createTBody();for(const event of visible){const row=body.insertRow();for(const value of [event.id,event.state,event.attempts,new Date(event.next_at).toLocaleString()]){const cell=row.insertCell();cell.textContent=String(value);}row.cells[1].className='state '+event.state;}
 wrap.append(table);events.append(wrap);
}
async function refresh(){if(!token)return;const credential=token;try{const response=await fetch('/events',{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error('unavailable');const received=await response.json();if(token!==credential)return;rows=received;if(!Array.isArray(rows))throw Error('invalid');render();document.getElementById('status').textContent='Connected · Updated '+new Date().toLocaleTimeString();}catch{if(token!==credential)return;events.textContent='Connection unavailable';document.getElementById('status').textContent='Disconnected · Retrying automatically';for(const state of ['pending','processing','delivered','dead'])document.getElementById('count-'+state).textContent='—';}}
document.getElementById('access').addEventListener('submit',e=>{e.preventDefault();token=document.getElementById('token').value;document.getElementById('token').value='';refresh();});
document.getElementById('disconnect').addEventListener('click',()=>{token='';rows=[];render();document.getElementById('status').textContent='Disconnected';});
filter.addEventListener('change',render);document.getElementById('status').textContent='Enter a read token to connect';setInterval(refresh,2000);
</script></main></body></html>`;
