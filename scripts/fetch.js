const fs=require("fs"),http=require("http"),https=require("https");
const src=JSON.parse(fs.readFileSync("sources.json","utf8"));
const perSrc=(src.fetch||{}).per_source||6;
const days=(src.fetch||{}).recent_days||7;
const cutoff=Date.now()-days*86400000;
const timeout=((src.fetch||{}).timeout||15)*1000;
const ua="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const results=[];

function fetchUrl(url){
  return new Promise((res,rej)=>{
    const mod=url.startsWith("https")?https:http;
    const ctrl=setTimeout(()=>rej(new Error("timeout")),timeout);
    try{
      const req=mod.get(url,{headers:{"User-Agent":ua}},(resp)=>{
        let data="";
        resp.on("data",c=>data+=c.toString());
        resp.on("end",()=>{clearTimeout(ctrl);res(data);});
      });
      req.on("error",e=>{clearTimeout(ctrl);rej(e);});
    }catch(e){clearTimeout(ctrl);rej(e);}
  });
}

async function pull(s){
  try{
    const x=await fetchUrl(s.url);
    const items=[];
    const parts=x.split("<item>");
    for(let i=1;i<parts.length&&items.length<perSrc;i++){
      const ix=parts[i];const end=ix.indexOf("</item>");
      if(end===-1)continue;
      const xml=ix.substring(0,end);
      const g=t=>{
        const si=xml.indexOf("<"+t+">");if(si===-1)return"";
        const cs=xml.indexOf("<![CDATA[",si);const cs2=si+t.length+2;
        if(cs!==-1&&cs<cs2+50){const ce=xml.indexOf("]]>",cs);if(ce!==-1)return xml.substring(cs+9,ce).trim();}
        const ei=xml.indexOf("</"+t+">",si);return ei===-1?"":xml.substring(cs2,ei).trim();
      };
      const pd=g("pubDate");
      if(pd&&new Date(pd).getTime()<cutoff)continue;
      items.push({title:g("title"),link:g("link"),pubDate:pd,summary:g("description").replace(/<[^>]*>/g,"").slice(0,300),source:s.name});
    }
    return {name:s.name,items};
  }catch(e){return{name:s.name,items:[],error:e.message};}
}

(async()=>{
  const sources=src.sources||[];
  console.log("Sources: "+sources.length);
  const batchSize=15;
  for(let i=0;i<sources.length;i+=batchSize){
    const batch=sources.slice(i,i+batchSize);
    const outs=await Promise.all(batch.map(s=>pull(s)));
    outs.forEach(o=>{
      if(o.error)console.log("FAIL "+o.name+": "+o.error);
      else console.log("OK "+o.items.length+" "+o.name);
      if(o.items)results.push(...o.items);
    });
  }
  const seen=new Set();
  const uniq=results.filter(i=>{const k=(i.title||"").slice(0,60);if(seen.has(k))return false;seen.add(k);return true;});
  uniq.sort((a,b)=>new Date(b.pubDate)-new Date(a.pubDate));
  console.log("\nTotal: "+uniq.length);
  const indData=src.industries.map(ind=>{
    const smap={};sources.filter(s=>s.hint===ind.key).forEach(s=>smap[s.name]=true);
    return {key:ind.key,name:ind.name,accent:ind.accent,total:sources.filter(s=>s.hint===ind.key).length,items:uniq.filter(i=>smap[i.source]).slice(0,30)};
  });
  const out={generated_at:new Date().toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"}),recent_days:days,industries:indData};
  fs.writeFileSync("data.js","// data.js - auto-generated\nwindow.DATA = "+JSON.stringify(out,null,1)+";\n","utf8");
  console.log("Written");
})().catch(e=>{console.error(e.message);process.exit(1);});