/* slop-audit client scoring + UI wiring */
const STOCK_EN=["delve","tapestry","testament to","in the realm of","navigating the","ever-evolving","ever-changing","fast-paced world","in today's","it's important to note","it is worth noting","moreover","furthermore","in conclusion","dive into","let's dive","unlock the","unleash","empower","game-changer","game changer","cutting-edge","state-of-the-art","seamless","robust","leverage","harness the power","foster","myriad","plethora","embark on","elevate your","comprehensive guide","look no further","whether you're a beginner","the world of","landscape of","underscore","pivotal","crucial","holistic","transformative","when it comes to","at the end of the day","rest assured","key takeaway","in this article","stay tuned","the digital age","play a vital role","plays a crucial role","wide range of","in summary"];
const STOCK_ID=["di era digital","di era modern","dalam dunia yang serba cepat","tak dapat dipungkiri","tidak dapat dipungkiri","seiring perkembangan teknologi","mari kita bahas","yuk simak","penting untuk diingat","sebagai kesimpulan","semoga artikel ini bermanfaat","semoga bermanfaat","berikut adalah beberapa","solusi terbaik","sesuai kebutuhan anda","tak perlu khawatir","wajib anda ketahui","dalam artikel ini","dengan demikian","oleh karena itu","selain itu","secara keseluruhan","memainkan peran penting","dunia yang terus berkembang"];
const HEDGE=["can help","may vary","it depends","always consult","be sure to","make sure to","it is recommended","you may want to","consider whether","in some cases","generally speaking","dapat membantu","mungkin berbeda","sebaiknya anda"];
const HUMAN=["i remember","last week","my friend","turns out","honestly","kinda","gonna","weirdly","i messed up","i was wrong","my kid","i tried","yesterday","this morning","the other day","i still don't","pretty sure","gue","nggak","banget","kayaknya","soalnya"];
const EMOJI=/[\u{1F680}\u{2728}\u{1F4A1}\u{1F511}\u{2705}\u{1F525}\u{1F4AA}\u{1F3AF}\u{1F31F}\u{1F449}]/gu;
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;'}[c]));
const rx=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const uniq=a=>[...new Set(a)];
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const sd=a=>{const r=mean(a);return Math.sqrt(a.map(x=>(x-r)**2).reduce((x,y)=>x+y,0)/a.length)};
function find(text,list){
  const pat=list.map(f=>(f.length<7&&!/\s/.test(f))?"\\b"+rx(f)+"\\b":rx(f)).join("|");
  const re=new RegExp(pat,"gi"); const out=[]; let m;
  while((m=re.exec(text))!==null){out.push(m[0].toLowerCase().trim());if(m.index===re.lastIndex)re.lastIndex++}
  return out;
}
function scoreArticle(text){
  const t=text.replace(/\r/g,"");
  const words=t.trim().split(/\s+/).filter(Boolean), n=words.length;
  const lines=t.split("\n").map(b=>b.trim()).filter(Boolean);
  const paras=t.split(/\n\s*\n/).map(p=>p.trim()).filter(p=>p.split(/\s+/).length>12);
  const sents=t.replace(/\n/g," ").split(/(?<=[.!?\u2026])\s+/).map(k=>k.trim()).filter(k=>k.split(/\s+/).length>2);
  let score=0; const marks=[];
  const add=(name,pts,ev)=>{if(!pts)return;score+=pts;marks.push({name,pts,ev})};
  const stock=uniq(find(t,STOCK_EN).concat(find(t,STOCK_ID)));
  if(stock.length) add("Stock phrases",Math.min(30,Math.round(stock.length*2.2+stock.length/Math.max(n,1)*500*2.4)),stock.slice(0,6).join(" \u00b7 "));
  const nj=t.match(/(not (?:just|only|merely)[^.!?\n]{3,70}?but|bukan (?:hanya|sekadar)[^.!?\n]{3,70}?(?:tetapi|tapi))/gi)||[];
  if(nj.length) add("The not just X, but Y move",Math.min(10,nj.length*5),nj[0].slice(0,70));
  const em=(t.match(/\u2014|\u2013/g)||[]).length, per=em/Math.max(n,1)*1000;
  if(per>5) add("Long dashes on repeat",Math.min(9,Math.round(per-3)),em+" dashes across "+n+" words");
  if(sents.length>=6){
    const len=sents.map(k=>k.split(/\s+/).length), cv=sd(len)/mean(len);
    if(cv<0.48) add("Sentences run all one length",Math.min(16,Math.round((0.48-cv)*46)),"average "+mean(len).toFixed(0)+" words, spread only \u00b1"+sd(len).toFixed(0));
  }
  if(paras.length>=4){
    const len=paras.map(p=>p.split(/\s+/).length);
    if(sd(len)/mean(len)<0.3) add("Paragraphs all the same size",8,paras.length+" paragraphs, each around "+mean(len).toFixed(0)+" words");
  }
  const bullets=lines.filter(b=>/^([-*\u2022\u00b7]|\d+[.)])\s+/.test(b)).length;
  if(lines.length>=6&&bullets/lines.length>0.3) add("Mostly bullet lists",Math.min(10,Math.round(bullets/lines.length*18)),bullets+" of "+lines.length+" lines");
  const bold=(t.match(/^\s*[^\n]{2,40}\s*:\s+\S/gm)||[]).length;
  if(bold>=4) add("Every item opens Term: explanation",Math.min(8,bold*2),bold+" items");
  const last=(paras[paras.length-1]||lines[lines.length-1]||"").toLowerCase();
  if(/^(in conclusion|to sum up|to summarize|overall|in summary|all in all|ultimately|kesimpulan|secara keseluruhan)/.test(last))
    add("Ends on a summary paragraph",7,last.slice(0,60)+"\u2026");
  const hedge=uniq(find(t,HEDGE));
  if(hedge.length>=2) add("Safe sentences that decide nothing",Math.min(8,hedge.length*3),hedge.slice(0,4).join(" \u00b7 "));
  const emo=(t.match(EMOJI)||[]).length;
  if(emo>=3) add("Emoji doing structural work",Math.min(7,emo),emo+" emoji");
  const nums=(t.match(/\b\d[\d.,]*\b/g)||[]).length,
        years=(t.match(/\b(19|20)\d{2}\b/g)||[]).length,
        props=(t.match(/(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}\b/gm)||[]).length,
        quotes=(t.match(/["\u201c][^"\u201d]{15,}["\u201d]/g)||[]).length;
  const density=(nums+years*2+props*0.6+quotes*3)/Math.max(n,1)*100;
  if(n>=120&&density<2.2) add("Almost nothing you could check",Math.min(15,Math.round((2.2-density)*7)),nums+" numbers \u00b7 "+props+" names \u00b7 "+quotes+" quotes");
  else if(density>5) add("Thick with concrete detail",-Math.min(12,Math.round(density)),"numbers, names and quotes are expensive to fake");
  const human=uniq(find(t,HUMAN));
  if(human.length) add("Traces of how people actually talk",-Math.min(20,human.length*4),human.slice(0,5).join(" \u00b7 "));
  marks.sort((a,b)=>Math.abs(b.pts)-Math.abs(a.pts));
  return {score:Math.max(0,Math.min(100,Math.round(score))),marks,n,stock,opener:words.slice(0,4).join(" ").toLowerCase()};
}
function scoreSite(arts,meta){
  const notes=[]; let shift=0;
  const scores=arts.map(a=>a.score);
  const base=mean(scores);
  if(arts.length>=3){
    const tally={};
    arts.forEach(a=>uniq(a.stock).forEach(k=>tally[k]=(tally[k]||0)+1));
    const shared=Object.keys(tally).filter(k=>tally[k]>=Math.ceil(arts.length*0.6));
    if(shared.length>=3){const p=Math.min(12,shared.length*2);shift+=p;notes.push({name:"The articles reuse the exact same phrases",pts:p,ev:shared.slice(0,6).join(" \u00b7 ")})}
    const len=arts.map(a=>a.n);
    if(sd(len)/mean(len)<0.22){shift+=9;notes.push({name:"Every article lands at the same length",pts:9,ev:len.join(" \u00b7 ")+" words"})}
    if(sd(scores)<9&&base>=50){shift+=8;notes.push({name:"Page scores cluster tightly",pts:8,ev:"spread of only \u00b1"+sd(scores).toFixed(0)+" points"})}
    if(sd(scores)>22){shift-=8;notes.push({name:"Page quality swings a lot",pts:-8,ev:"spread of \u00b1"+sd(scores).toFixed(0)+" points"})}
    const first=arts.map(a=>a.opener.split(" ")[0]);
    if(uniq(first).length<=Math.ceil(arts.length/2)){shift+=6;notes.push({name:"Articles open on the same word",pts:6,ev:uniq(first).join(" \u00b7 ")})}
  }
  if(meta){
    const named=meta.authors.filter(Boolean);
    if(meta.authors.length>=3&&!named.length){shift+=8;notes.push({name:"Nobody's name is on any of these",pts:8,ev:"no byline found on "+meta.authors.length+" pages"})}
    else if(named.length&&uniq(named).length>=2){shift-=6;notes.push({name:"Several named writers",pts:-6,ev:uniq(named).slice(0,4).join(" \u00b7 ")})}
    const days=meta.dates.filter(Boolean).map(d=>new Date(d));
    if(days.length>=4){
      const spread=(Math.max(...days)-Math.min(...days))/86400000;
      if(spread<3){shift+=8;notes.push({name:"Posts published in one tight burst",pts:8,ev:days.length+" sampled posts within "+spread.toFixed(1)+" days"})}
    }
    const tl=meta.titles.filter(Boolean).map(t=>t.split(/\s+/).length);
    if(tl.length>=4&&sd(tl)/mean(tl)<0.18){shift+=5;notes.push({name:"Headlines built to one formula",pts:5,ev:"every title around "+mean(tl).toFixed(0)+" words long"})}
  }
  return {score:Math.max(0,Math.min(100,Math.round(base+shift))),base:Math.round(base),notes};
}
const TIER=[{min:0,name:"Most pages read like a person wrote them",stamp:"CLEAN",color:"var(--clean)"},{min:28,name:"AI habits show up on some pages",stamp:"READ AGAIN",color:"var(--ink)"},{min:52,name:"This site runs on a content-farm pattern",stamp:"SLOP",color:"var(--pen)"},{min:76,name:"Nearly every page carries the markers",stamp:"HEAVY SLOP",color:"var(--pen)"}];
const tier=s=>TIER.slice().reverse().find(t=>s>=t.min);
function verdictBlock(score,host){
  const t=tier(score);
  const ticks=Array.from({length:40},(_,i)=>{const on=i<Math.round(score/2.5);return '<span class="tick'+(on?" on":"")+'" style="'+(on?"background:"+t.color:"")+'"></span>'}).join("");
  return '<div class="verdict"><div class="stamp" style="color:'+t.color+'">'+t.stamp+'</div>'+(host?'<p class="host">'+esc(host)+'</p>':"")+'<p class="score">'+score+'<span>/100</span></p><p class="verdict-line">'+esc(t.name)+'</p><div class="ruler">'+ticks+'</div><div class="scale"><span>written by someone</span><span>slop</span></div></div>';
}
function findingList(list){
  if(!list.length) return '<p class="note">No site-wide pattern triggered.</p>';
  return '<ol class="findings">'+list.map(s=>'<li><div class="f-top"><span class="f-name">'+esc(s.name)+'</span><span class="f-pts '+(s.pts>0?"up":"down")+'">'+(s.pts>0?"+":"")+s.pts+'</span></div><p class="f-ev">'+esc(s.ev)+'</p></li>').join("")+'</ol>';
}
function row(id,titleHtml,note){
  return '<li id="'+id+'"><div><p class="row-title">'+titleHtml+'</p><p class="row-note">'+esc(note)+'</p></div><div class="bar"><i style="width:0"></i></div><div class="val none">\u2026</div></li>';
}
function fillRow(id,score,note){
  const li=document.getElementById(id); if(!li)return;
  li.querySelector(".row-note").textContent=note||"";
  const bar=li.querySelector(".bar i"), val=li.querySelector(".val");
  if(score==null){bar.style.width="0";val.textContent="\u2014";val.className="val none"}
  else{bar.style.width=score+"%";bar.style.background=tier(score).color;val.textContent=score;val.className="val"}
}
const $=id=>document.getElementById(id);
const out=$("out"), msg=$("msg"), run=$("run");
let mode="site";
function pick(m){
  mode=m;
  $("tab-site").setAttribute("aria-selected",m==="site");
  $("tab-paste").setAttribute("aria-selected",m==="paste");
  $("pane-site").hidden=m!=="site"; $("pane-paste").hidden=m!=="paste";
  $("example").hidden=m!=="paste";
  run.textContent=m==="site"?"Scan site":"Score articles";
  count();
}
$("tab-site").onclick=()=>pick("site");
$("tab-paste").onclick=()=>pick("paste");
const chunks=()=>$("paste").value.split(/^\s*-{3,}\s*$/m).map(s=>s.trim()).filter(s=>s.split(/\s+/).length>=40);
function count(){
  if(mode==="site") $("count").textContent=$("domain").value.trim()?"1 site":"nothing yet";
  else{const n=chunks().length;$("count").textContent=n?n+(n===1?" article":" articles")+" found":"nothing yet"}
}
$("domain").addEventListener("input",count);
$("paste").addEventListener("input",count);
$("domain").addEventListener("keydown",e=>{if(e.key==="Enter")run.click()});
$("example").onclick=()=>{
  const a="In today's fast-paced world, it is important to note that technology plays a crucial role in our daily lives. There are a wide range of benefits that come with this transformation.\n\nHere are some key things to consider:\n\n- Efficiency: Technology helps streamline everyday tasks.\n- Flexibility: You can work from anywhere that suits your needs.\n- Collaboration: Teams can connect without limits of time or space.\n\nMoreover, it is worth noting that technology is not just about tools, but about mindset. Furthermore, we must continue to adapt to an ever-evolving landscape. Rest assured, this process can be done gradually.\n\nIn conclusion, leveraging technology wisely is the best solution for the challenges ahead.";
  const b="In today's fast-paced world, it is important to note that wellness plays a crucial role in productivity. There are a wide range of benefits that come with a steady routine.\n\nHere are some key things to consider:\n\n- Rest: The body needs adequate recovery time each night.\n- Nutrition: Intake should be adjusted to suit your needs.\n- Movement: Light activity can help maintain your stamina.\n\nMoreover, it is worth noting that wellness is not just about the body, but about the mind. Furthermore, balance must be maintained across an ever-changing schedule. Rest assured, small steps are enough.\n\nIn conclusion, building healthy habits is the best solution for the long term.";
  const c="In today's digital age, it is important to note that budgeting plays a vital role in future planning. There are a wide range of benefits that come with careful management.\n\nHere are some key things to consider:\n\n- Tracking: Record what comes in and what goes out.\n- Emergencies: Set aside funds according to your needs.\n- Investing: Start gradually, and rest assured it compounds.\n\nMoreover, it is worth noting that money is not just about numbers, but about habits. Furthermore, consistency is crucial in an ever-evolving economy.\n\nIn conclusion, managing finances wisely is the best solution for lasting security.";
  $("paste").value=[a,b,c].join("\n\n---\n\n"); count();
};
run.onclick=()=>{msg.textContent=""; return mode==="paste"?runPaste():runSite()};
function runPaste(){
  const parts=chunks();
  if(!parts.length){msg.textContent="No article is long enough yet. Each one needs at least 40 words.";return}
  if(parts.length<3) msg.textContent="Only "+parts.length+" so far. Site-level patterns need at least 3 to mean anything.";
  const arts=parts.map(scoreArticle);
  const site=scoreSite(arts,null);
  out.innerHTML=verdictBlock(site.score,parts.length+" pasted articles")+'<h2 class="part">Score per article</h2><ul class="ledger">'+arts.map((a,i)=>'<li><div><p class="row-title">Article '+(i+1)+'</p><p class="row-note">'+esc(a.n+" words \u00b7 "+(a.marks[0]?a.marks[0].name.toLowerCase():"nothing flagged"))+'</p></div><div class="bar"><i style="width:'+a.score+'%;background:'+tier(a.score).color+'"></i></div><div class="val">'+a.score+'</div></li>').join("")+'</ul><h2 class="part">What runs across the whole set</h2>'+findingList(site.notes)+'<p class="note">Pages average '+site.base+', adjusted to '+site.score+' once the cross-article patterns are counted.</p>';
}
async function runSite(){
  const host=$("domain").value.trim().replace(/^https?:\/\//,"").replace(/\/.*$/,"");
  if(!/^[\w-]+(\.[\w-]+)+$/.test(host)){msg.textContent="That address isn't right. Try something like example.com";return}
  const n=+document.querySelector("input[name=n]:checked").value;
  run.disabled=true;
  out.innerHTML='<p class="load">Looking for '+esc(host)+"\u2019s sitemap\u2026</p>";
  let list;
  try{
    const r=await fetch("/api/pages?domain="+encodeURIComponent(host)+"&n="+n);
    list=await r.json();
    if(list.error) throw new Error(list.error);
  }catch(e){
    out.innerHTML='<p class="err">'+esc(e.message||"Couldn't reach the site.")+'</p><p class="note">Open a few of its pages, copy the text, and use the Paste articles tab with <code>---</code> between them.</p>';
    run.disabled=false; return;
  }
  out.innerHTML='<div id="summary"><p class="load">Reading '+list.urls.length+' pages\u2026</p></div><h2 class="part">Pages checked</h2><ul class="ledger" id="ledger">'+list.urls.map((u,i)=>row("p"+i,'<a href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(u.replace(/^https?:\/\/[^/]+/,""))+"</a>","fetching\u2026")).join("")+"</ul><p class=\"note\">Sampled from <code>"+esc(list.source)+"</code>, "+list.total+" candidate pages found.</p>";
  const arts=[], meta={authors:[],dates:[],titles:[]};
  for(let i=0;i<list.urls.length;i+=2){
    await Promise.all(list.urls.slice(i,i+2).map(async(u,j)=>{
      const id="p"+(i+j);
      try{
        const r=await fetch("/api/read?url="+encodeURIComponent(u));
        const d=await r.json();
        if(d.error||!d.text||d.words<80){fillRow(id,null,d.error||"too little text");return}
        const a=scoreArticle(d.text);
        arts.push(a);
        meta.authors.push(d.author||"");
        meta.dates.push(d.published||"");
        meta.titles.push(d.title||"");
        const li=document.getElementById(id);
        if(li&&d.title) li.querySelector(".row-title a").textContent=d.title;
        fillRow(id,a.score,d.words+" words \u00b7 "+(a.marks[0]?a.marks[0].name.toLowerCase():"nothing flagged"));
      }catch{fillRow(id,null,"failed")}
    }));
  }
  const sum=$("summary");
  if(!arts.length){
    sum.innerHTML='<p class="err">None of those pages gave up enough text to score.</p><p class="note">Sites that render everything in JavaScript come back empty. Use the Paste articles tab instead.</p>';
  }else{
    const site=scoreSite(arts,meta);
    sum.innerHTML=verdictBlock(site.score,host)+'<h2 class="part">What runs across the whole site</h2>'+findingList(site.notes)+'<p class="note">Pages average '+site.base+', adjusted to '+site.score+' once the cross-page patterns are counted. Based on '+arts.length+' page'+(arts.length===1?"":"s")+' that came back readable.</p>';
  }
  run.disabled=false;
}
pick("site");
