
const fs=require("fs");
const src=JSON.parse(fs.readFileSync("sources.json","utf8"));
const perSrc=(src.fetch||{}).per_source||6;
const days=(src.fetch||{}).recent_days||7;
const cutoff=Date.now()-days*86400000;
const to=((src.fetch||{}).timeout||15)*1000;
const industries=src.industries||[];
async function pull(s){
  try{
    const a=new AbortController();setTimeout(()=>a.abort(),to);
    const x=await(await fetch(s.url,{signal:a.signal})).text();
    const items=[];const re=/<item>([\s\S]*?)<\/item>/g;let m;
    while((m=re.exec(x))&&items.length<perSrc){
      const ix=m[1];const g=t=>{const p=new RegExp("<"+t+'[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/'+t+'>|<'+t+'[^>]*>([\\s\\S]*?)<\\/'+t+">");const r=p.exec(ix);return(r&&(r[1]||r[2]||"")).trim();};
      const d=g("pubDate");
      if(d&&new Date(d).getTime()<cutoff)continue;
      items.push({title:g("title"),link:g("link"),pubDate:d,summary:g("description").replace(/<[^>]*>/g,"").slice(0,300)});
    }
    return items;
  }catch(e){return[];}
}
(async()=>{
  const all=await Promise.all((src.sources||[]).map(s=>pull(s)));
  const flat=all.flat();
  const seen=new Set();
  const uniq=flat.filter(i=>{const k=(i.title||"").slice(0,60);if(seen.has(k))return false;seen.add(k);return true;});
  uniq.sort((a,b)=>new Date(b.pubDate)-new Date(a.pubDate));
  const indData=industries.map(ind=>({
    key:ind.key,name:ind.name,accent:ind.accent,
    total:(src.sources||[]).filter(s=>s.hint===ind.key).length,
    items:uniq.filter(i=>{const s=(src.sources||[]).find(x=>x.name===i.source);return s&&s.hint===ind.key;}).slice(0,30)
  }));
  const out={generated_at:new Date().toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"}),recent_days:days,industries:indData};
  fs.writeFileSync("data.js","// data.js - auto-generated\nwindow.DATA = "+JSON.stringify(out,null,1)+";\n","utf8");
  console.log("OK: "+uniq.length+" items");
})().catch(e=>{console.error(e.message);process.exit(1);});
