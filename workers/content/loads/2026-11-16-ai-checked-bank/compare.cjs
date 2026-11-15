/* eslint-disable @typescript-eslint/no-require-imports -- archived one-off CommonJS script */
const fs=require("fs");
const rows=new Map(fs.readFileSync(".local/content/bank-jee.jsonl","utf8").trim().split("\n").map(l=>{const r=JSON.parse(l);return [r.id,r]}));
const res={agree:[],disagree:[],missing:[]};
for(let b=1;b<=8;b++){const f=`.local/content/check/batch-${b}.answers.jsonl`;
 for(const l of fs.readFileSync(f,"utf8").trim().split(/\r?\n/)){ if(!l.trim()) continue; const a=JSON.parse(l); const r=rows.get(a.id); if(!r){res.missing.push(a.id);continue}
  const k=r.answer; if(!k){res.missing.push(a.id+" (no key)");continue} let ok=false;
  if(a.answer==null) ok=false;
  else if(k.type==="single_correct") ok=String(a.answer).trim().toUpperCase()===k.optionId;
  else if(k.type==="multiple_correct") ok=JSON.stringify([...(Array.isArray(a.answer)?a.answer:[a.answer])].map(String).sort())===JSON.stringify([...k.optionIds].sort());
  else if(k.type==="numerical"){const v=Number(a.answer),t=Math.max(k.tolerance||0,Math.abs(k.value)*0.01,0.01); ok=Number.isFinite(v)&&Math.abs(v-k.value)<=t;}
  (ok?res.agree:res.disagree).push({id:a.id,got:a.answer,want:k.optionId??k.optionIds??k.value,type:k.type});
 }}
const seen=new Set([...res.agree,...res.disagree].map(x=>x.id)); const notAnswered=[...rows.keys()].filter(i=>!seen.has(i));
console.log("agree",res.agree.length,"disagree",res.disagree.length,"not answered",notAnswered.length,"unknown ids",res.missing.length);
fs.writeFileSync(".local/content/check/agree.json",JSON.stringify(res.agree.map(x=>x.id)));
fs.writeFileSync(".local/content/check/disagree.json",JSON.stringify(res.disagree,null,1));
console.log(res.disagree.slice(0,12).map(d=>`${d.id} ${d.type} got=${JSON.stringify(d.got)} want=${JSON.stringify(d.want)}`).join("\n"));
