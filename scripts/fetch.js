const fs=require('fs');
const src=JSON.parse(fs.readFileSync('sources.json','utf8'));
const perSrc=(src.fetch||{}).per_source||6;
const days=(src.fetch||{}).recent_days||7;
const cutoff=Date.now()-days*86400000;
const to=((src.fetch||{}).timeout||15)*1000;
const industries=src.industries||[];

async function pull(s){
  try{
    const a=new AbortController();setTimeout(()=>a.abort(),to);
    const x=await(await fetch(s.url,{signal:a.signal})).text();
    const items=[];
    const parts=x.split('<item>');
    for(let i=1;i<parts.length&&items.length<perSrc;i++){
      const item=parts[i];
      const end=item.indexOf('</item>');
      if(end===-1)continue;
      const ix=item.substring(0,end);
      const g=(tag)=>{
        const start=ix.indexOf('<'+tag+'>');
        if(start===-1){return '';}
        const cStart=ix.indexOf('<![CDATA[',start);
        const contentStart=start+tag.length+2;
        if(cStart!==-1&&cStart<contentStart+50){
          const cdEnd=ix.indexOf(']]>',cStart);
          if(cdEnd!==-1)return ix.substring(cStart+9,cdEnd).trim();
        }
        const endTag=ix.indexOf('</'+tag+'>',start);
        if(endTag!==-1)return ix.substring(contentStart,endTag).trim();
        return '';
      };
      const pd=g('pubDate');
      if(pd&&new Date(pd).getTime()<cutoff)continue;
      items.push({title:g('title'),link:g('link'),pubDate:pd,summary:g('description').replace(/<[^>]*>/g,'').slice(0,300)});
    }
    console.log('OK '+items.length+' '+s.name);
    return items;
  }catch(e){
    console.log('FAIL '+s.name+': '+e.message);
    return[];
  }
}

(async()=>{
  const all=await Promise.all((src.sources||[]).map(s=>pull(s)));
  const flat=all.flat();
  const seen=new Set();
  const uniq=flat.filter(i=>{const k=(i.title||'').slice(0,60);if(seen.has(k))return false;seen.add(k);return true;});
  uniq.sort((a,b)=>new Date(b.pubDate)-new Date(a.pubDate));
  console.log('');
  console.log('Total unique: '+uniq.length);
  const indData=industries.map(ind=>{
    const srcMap={};(src.sources||[]).filter(s=>s.hint===ind.key).forEach(s=>srcMap[s.name]=true);
    return {
      key:ind.key,name:ind.name,accent:ind.accent,
      total:(src.sources||[]).filter(s=>s.hint===ind.key).length,
      items:uniq.filter(i=>srcMap[i.source]).slice(0,30)
    };
  });
  const out={generated_at:new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}),recent_days:days,industries:indData};
  fs.writeFileSync("data.js","// data.js - auto-generated\nwindow.DATA = "+JSON.stringify(out,null,1)+";\n","utf8");
  console.log('Written data.js');
})().catch(e=>{console.error(e.message);process.exit(1);});
