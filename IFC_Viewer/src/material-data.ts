export type Cell = string | number | boolean;
export type Row = { id: number; values: Record<string, Cell>; sources: Record<string,string> };
export const labels: Record<string,string> = {name:'IFC name',type:'IFC type',guid:'IFC GlobalId',tag:'IFC tag',file:'Source file',section:'Section size',length:'Length (m)',weight:'Weight (kg)',works:'1.01 MET Works',description:'1.02 MET Description',reference:'Member reference',quantity:'Quantity'};
export const defaults=['reference','name','section','length','weight','works','description'];
const rels=['IsDefinedBy','IsTypedBy','HasPropertySets','HasProperties','Quantities','HasQuantities','Properties','UnitsInContext','Units','Unit','ConversionFactor','UnitComponent'];
const cfg={attributesDefault:true,relations:Object.fromEntries(rels.map(k=>[k,{attributes:true,relations:false}]))};
const val=(x:any,k:string)=>x?.[k]?.value;
const id=(x:any)=>val(x,'_localId');
export async function readRows(model:any,file:string,progress:(s:string)=>void=()=>{}):Promise<Row[]> {
 const ids:number[]=await model.getItemsIdsWithGeometry();
 const projects=await model.getItemsOfCategories([/^IFCPROJECT$/]);
 const cache=new Map<number,any>(); let pending=[...ids,...Object.values(projects).flat() as number[]];
 // Read only property and unit relationships. Never follow owner history or inverse member links.
 for(let depth=0;depth<7&&pending.length;depth++){
  const next=new Set<number>();
  for(let i=0;i<pending.length;i+=250){
   progress(`Reading member information… ${cache.size} records`);
   const data=await model.getItemsData(pending.slice(i,i+250),cfg);
   for(const item of data){if(!item||!Number.isFinite(id(item)))continue;cache.set(id(item),item); for(const key of rels)for(const child of item[key]||[])if(Number.isFinite(id(child))&&!cache.has(id(child)))next.add(id(child));}
  }
  pending=[...next].filter(n=>!cache.has(n));
 }
 const get=(x:any)=>cache.get(id(x))||x;
 const children=(x:any,k:string)=>(x[k]||[]).map(get);
 const prefixes:Record<string,number>={EXA:1e18,PETA:1e15,TERA:1e12,GIGA:1e9,MEGA:1e6,KILO:1e3,HECTO:1e2,DECA:10,DECI:.1,CENTI:.01,MILLI:.001,MICRO:1e-6,NANO:1e-9};
 function factor(unit:any,depth=0):number|undefined{
  if(!unit||depth>4)return undefined;
  const cat=val(unit,'_category');
  if(cat==='IFCSIUNIT'){
   const name=val(unit,'Name'); if(name!=='METRE'&&name!=='GRAM')return undefined;
   return (prefixes[val(unit,'Prefix')]??1)*(name==='GRAM'?.001:1);
  }
  if(cat==='IFCCONVERSIONBASEDUNIT'){
   const f=children(unit,'ConversionFactor')[0];const v=val(f,'ValueComponent');const base=f&&factor(children(f,'UnitComponent')[0],depth+1);
   return typeof v==='number'&&base!==undefined?v*base:undefined;
  } return undefined;
 }
 const units=new Map<string,number>();
 for(const item of cache.values())if(val(item,'_category')==='IFCUNITASSIGNMENT')for(const u of children(item,'Units')){const f=factor(u);if(f!==undefined)units.set(val(u,'UnitType'),f);}
 return ids.map(n=>{
  const root=cache.get(n)||{};const values:Record<string,Cell>={quantity:1,file};const sources:Record<string,string>={};
  for(const [key,attr]of Object.entries(root))if(!Array.isArray(attr)&&val(root,key)!=null&&typeof val(root,key)!=='object')values[`IFC · ${key}`]=val(root,key);
  values.name=val(root,'Name')??'';values.type=val(root,'_category')??'';values.guid=val(root,'_guid')??'';values.tag=val(root,'Tag')??'';
  const candidates:{key:string;name:string;value:Cell;type:string;unit?:number;explicit?:boolean}[]=[];
  function visit(node:any,context:string,depth=0){
   if(depth>5)return; const cat=val(node,'_category')||'';
   if(cat==='IFCPROPERTYSET'||cat==='IFCELEMENTQUANTITY')context=val(node,'Name')||context;
   const name=val(node,'Name');
   const attr=['NominalValue','LengthValue','WeightValue','MassValue','AreaValue','VolumeValue','CountValue','TimeValue','Value'].find(k=>val(node,k)!=null);
   if(name&&attr){const value=val(node,attr);if(['string','number','boolean'].includes(typeof value)){
    const key=`${context} · ${name}`;values[key]=value;
    const explicit=children(node,'Unit')[0];candidates.push({key,name,value,type:node[attr]?.type||'',unit:explicit?factor(explicit):undefined,explicit:!!explicit});
   }}
   for(const r of ['HasPropertySets','HasProperties','Quantities','HasQuantities','Properties'])for(const c of children(node,r))visit(c,context,depth+1);
  }
  const sets=[...children(root,'IsDefinedBy'),...children(root,'IsTypedBy')];
  // Type defaults first; instance values take precedence.
  sets.sort((a,b)=>Number(!/TYPE$/.test(val(a,'_category')||''))-Number(!/TYPE$/.test(val(b,'_category')||'')));
  for(const set of sets)visit(set,/TYPE$/.test(val(set,'_category')||'')?'Type':'Properties');
  candidates.reverse();
  function choose(target:string,names:RegExp[],measure?:string){
   for(const match of names){const c=candidates.find(c=>match.test(c.name)&&(!measure||typeof c.value==='number'&&c.type.includes(measure)));
    if(!c)continue;
    if(measure){const f=c.explicit?c.unit:units.get(measure==='LENGTH'?'LENGTHUNIT':'MASSUNIT');if(f===undefined)continue;values[target]=(c.value as number)*f;}
    else values[target]=c.value;
    sources[target]=c.key;return;
   }
  }
  choose('length',[/^Length$/i,/^NetLength$/i,/^Cut Length$/i,/^System Length$/i],'LENGTH');
  choose('weight',[/^Exact Weight$/i,/^NetWeight$/i,/^Weight$/i,/^GrossWeight$/i],'MASS');
  choose('section',[/^Reference$/i,/^Section Size$/i,/^Section$/i,/^Profile$/i]);
  choose('works',[/^1[._ ]01[._ ]MET[._ ]Works$/i]);choose('description',[/^1[._ ]02[._ ]MET[._ ]Description$/i]);
  choose('reference',[/^Comments$/i,/^Mark$/i,/^Reference$/i]);
  return {id:n,values,sources};
 });
}
const naturalOrder=new Intl.Collator(undefined,{numeric:true});
export type TableRow={ids:number[];values:Record<string,Cell>};
export function tableRows(rows:Row[],groups:string[],search:string,sort:string,descending:boolean):TableRow[]{
 const query=search.toLowerCase();
 const filtered=rows.filter(r=>!query||Object.values(r.values).some(v=>String(v).toLowerCase().includes(query)));
 let result:TableRow[];
 if(!groups.length)result=filtered.map(r=>({ids:[r.id],values:r.values}));
 else{
  const buckets=new Map<string,Row[]>();for(const row of filtered){const k=JSON.stringify(groups.map(g=>row.values[g]??null));const bucket=buckets.get(k)||[];bucket.push(row);buckets.set(k,bucket);}
  result=[...buckets.values()].map(bucket=>{const values:Record<string,Cell>={quantity:bucket.length};
   for(const k of new Set(bucket.flatMap(r=>Object.keys(r.values)))){
    const vals=bucket.map(r=>r.values[k]);
    if(k==='quantity')continue;
    if((k==='length'||k==='weight')&&!groups.includes(k)){
     if(vals.every(v=>typeof v==='number'))values[k]=(vals as number[]).reduce((a,b)=>a+b,0);
    }else if(vals.every(v=>v===vals[0])&&vals[0]!==undefined)values[k]=vals[0];else values[k]='(varies)';
   }return {ids:bucket.map(r=>r.id),values};});
 }
 return result.sort((a,b)=>{const x=a.values[sort],y=b.values[sort];if(x==null)return y==null?0:1;if(y==null)return -1;return (typeof x==='number'&&typeof y==='number'?x-y:naturalOrder.compare(String(x),String(y)))*(descending?-1:1);});
}
export const display=(v:Cell|undefined)=>v===undefined||v===''?'—':typeof v==='number'?Number(v.toFixed(3)).toLocaleString('en-GB',{maximumFractionDigits:3}):String(v);
export function exportText(rows:TableRow[],fields:string[],format:'csv'|'txt'){
 const safe=(v:Cell|undefined)=>{const s=v==null?'':String(v);return typeof v==='string'&&/^[\s]*[=+@-]/.test(s)?"'"+s:s;};
 const grid=[fields.map(k=>safe(labels[k]||k)),...rows.map(r=>fields.map(k=>safe(r.values[k])))];
 if(format==='csv')return '\ufeff'+grid.map(row=>row.map(s=>'"'+String(s).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
 return grid.map(row=>row.map(s=>String(s).replace(/[\t\r\n]+/g,' ')).join('\t')).join('\r\n')+'\r\n';
}
