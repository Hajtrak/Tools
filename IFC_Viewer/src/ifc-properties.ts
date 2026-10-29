import * as IFC from 'web-ifc';
import type {Cell, Row} from './material-data';
type Binding={set:number;property:number;attribute:string;relation?:number;inherited:boolean};
export type Edit={ids:number[];key?:string;set?:string;name?:string;value:Cell};
const primitive=(x:any):any=>x==null?'':Array.isArray(x)?x.map(primitive):typeof x==='object'&&'value'in x?primitive(x.value):x;
const scalar=(x:any):Cell=>{const v=primitive(x);return ['string','number','boolean'].includes(typeof v)?v:JSON.stringify(v);};
export class IfcProperties {
 private bindings=new Map<number,Map<string,Binding>>();
 private edits:Edit[]=[];
 private savedCount=0;
 get dirty(){return this.edits.length>this.savedCount;}
 markSaved(){this.savedCount=this.edits.length;}
 private constructor(private api:IFC.IfcAPI,private model:number,private original:Uint8Array){}
 static async open(bytes:Uint8Array){const api=new IFC.IfcAPI();api.SetWasmPath(new URL('vendor/',document.baseURI).href,true);await api.Init();return new IfcProperties(api,api.OpenModel(bytes),bytes.slice());}
 static fromAPI(api:IFC.IfcAPI,model:number,bytes:Uint8Array){return new IfcProperties(api,model,bytes.slice());}
 close(){this.api.CloseModel(this.model);this.api.Dispose();}
 get count(){return this.edits.length;}
 private line(id:number){return this.api.GetLine(this.model,id);}
 private value(x:any,seen=new Set<number>()):Cell{
  const expand=(v:any):any=>{if(v==null)return null;if(Array.isArray(v))return v.map(expand);if(typeof v!=='object')return v;if(v.type===5&&typeof v.value==='number'){if(seen.has(v.value))return '#'+v.value;const next=new Set(seen).add(v.value);return JSON.parse(JSON.stringify(this.line(v.value),(_key,val)=>{if(val?.type===5)return '#'+val.value;return val;}));}if('value'in v)return expand(v.value);return v;};
  const v=expand(x);return ['string','number','boolean'].includes(typeof v)?v:JSON.stringify(v);
 }
 private each(type:number,fn:(line:any)=>void){const ids=this.api.GetLineIDsWithType(this.model,type,true);for(let i=0;i<ids.size();i++)fn(this.line(ids.get(i)));}
 discover(rows:Row[]){
  const known=new Set(rows.map(r=>r.id));
  this.each(IFC.IFCELEMENT,element=>{if(!known.has(element.expressID)){rows.push({id:element.expressID,values:{quantity:1,file:rows[0]?.values.file||''},sources:{}});known.add(element.expressID);}});
  for(const row of rows){row.values={quantity:1,file:row.values.file||''};row.sources={};}
  const fieldKeys=new Map<number,Set<string>>();
  const byId=new Map(rows.map(r=>[r.id,r]));this.bindings.clear();
  const put=(id:number,setId:number,relation:number|undefined,inherited:boolean)=>{
   const row=byId.get(id);if(!row)return;const set=this.line(setId);if(!set)return;
   const visit=(refs:any[],path:string,seen:Set<number>)=>{for(const ref of refs||[]){if(seen.has(ref.value))continue;const next=new Set(seen).add(ref.value);const p=this.line(ref.value);if(!p)continue;const baseKey=path+' · '+scalar(p.Name);const used=fieldKeys.get(id)||new Set<string>();const key=used.has(baseKey)?baseKey+' [#'+p.expressID+']':baseKey;used.add(baseKey);fieldKeys.set(id,used);
    const child=p.HasProperties||p.HasQuantities;
    if(child){visit(child,key,next);continue;}
    const attrs=Object.keys(p).filter(k=>!['expressID','type','Name','Description','Unit'].includes(k));
    const editable=p.type===IFC.IFCPROPERTYSINGLEVALUE?'NominalValue':p.type===IFC.IFCQUANTITYLENGTH?'LengthValue':p.type===IFC.IFCQUANTITYAREA?'AreaValue':p.type===IFC.IFCQUANTITYVOLUME?'VolumeValue':p.type===IFC.IFCQUANTITYWEIGHT?'WeightValue':p.type===IFC.IFCQUANTITYCOUNT?'CountValue':p.type===IFC.IFCQUANTITYTIME?'TimeValue':undefined;
    if(p.Unit)row.values[key+' · Unit']=this.value(p.Unit);if(p.Description)row.values[key+' · Description']=scalar(p.Description);
    if(editable){row.values[key]=scalar(p[editable]);const b=this.bindings.get(id)||new Map();b.set(key,{set:setId,property:p.expressID,attribute:editable,relation,inherited});this.bindings.set(id,b);for(const attr of attrs)if(attr!==editable)row.values[key+' · '+attr]=this.value(p[attr]);}
    else for(const attr of attrs)row.values[key+' · '+attr]=this.value(p[attr]);
   }};
   visit(set.HasProperties||set.Quantities||[],(inherited?'Type · ':'')+scalar(set.Name),new Set());
  };
  // Type values are kept separately so shared defaults and instance overrides are distinguishable.
  this.each(IFC.IFCRELDEFINESBYTYPE,rel=>{const type=this.line(rel.RelatingType.value);for(const obj of rel.RelatedObjects||[])for(const set of type.HasPropertySets||[])put(obj.value,set.value,undefined,true);});
  this.each(IFC.IFCRELDEFINESBYPROPERTIES,rel=>{const refs=Array.isArray(rel.RelatingPropertyDefinition)?rel.RelatingPropertyDefinition:[rel.RelatingPropertyDefinition];for(const obj of rel.RelatedObjects||[])for(const ref of refs)if(ref)put(obj.value,ref.value,rel.expressID,false);});
  for(const row of rows){const root=this.line(row.id);for(const [key,v]of Object.entries(root||{}))if(!['expressID','type','OwnerHistory','ObjectPlacement','Representation'].includes(key)&&v!=null)row.values['IFC · '+key]=scalar(v);}
  return rows;
 }
 writable(ids:number[],key:string){return ids.length>0&&ids.every(id=>this.bindings.get(id)?.has(key)||this.edits.some(e=>!e.key&&e.ids.includes(id)&&e.set+' · '+e.name===key)||['IFC · Name','IFC · Description','IFC · ObjectType','IFC · Tag'].includes(key));}
 stage(edit:Edit,rows:Row[]){
  if(!edit.ids.length)throw Error('Select at least one element.');
  if(edit.key&&!this.writable(edit.ids,edit.key))throw Error('This field is read-only or missing on some selected elements.');
  if(!edit.key&&(!edit.set?.trim()||!edit.name?.trim()))throw Error('Enter a property set and property name.');
  if(!edit.key){const key=edit.set+' · '+edit.name;if(rows.some(r=>edit.ids.includes(r.id)&&key in r.values))throw Error('This property already exists. Choose it under Existing field.');}
  if(typeof edit.value==='number'&&!Number.isFinite(edit.value))throw Error('Enter a finite number.');
  // Validate every target before changing the visible data.
  for(const id of edit.ids){const b=edit.key&&this.bindings.get(id)?.get(edit.key);if(b){const originalValue=this.line(b.property)[b.attribute];const old=primitive(originalValue);const kind=originalValue?.constructor?.name||'';if(typeof edit.value==='number'&&(/Positive/.test(kind)&&edit.value<=0||/NonNegative/.test(kind)&&edit.value<0||/Integer/.test(kind)&&!Number.isInteger(edit.value)))throw Error('Value does not satisfy the IFC measure type.');if(old!==''&&typeof old!==typeof edit.value)throw Error('Use the existing value type.');if(b.attribute!=='NominalValue'&&(typeof edit.value!=='number'||edit.value<0))throw Error('Quantities require a non-negative number.');}}
  this.edits.push({...edit,ids:[...edit.ids]});
  for(const row of rows)if(edit.ids.includes(row.id)){const key=edit.key||edit.set+' · '+edit.name;row.values[key]=edit.value;for(const [alias,source]of Object.entries(row.sources))if(source===key)delete row.values[alias];}
 }
 export(){
  // Always replay on a fresh copy. Failed or cancelled exports cannot mutate the loaded source.
  const api=this.api,m=api.OpenModel(this.original);if(m<0)throw Error('Could not reopen original IFC.');
  const read=(id:number)=>api.GetLine(m,id);
  const write=(line:any)=>{api.WriteLine(m,line);return new IFC.Handle(line.expressID);};
  const create=(type:number,...args:any[])=>write(api.CreateIfcEntity(m,type,...args));
  const label=(s:string)=>api.CreateIfcType(m,IFC.IFCLABEL,s);
  const guid=()=>api.CreateIFCGloballyUniqueId(m);
  const customSets=new Map<string,any>();
  const clones=new Map<string,{set:any;properties:Map<number,any>}>();
  const ensureClone=(id:number,b:Binding,owner:any)=>{const cloneKey=id+':'+b.set;const existing=clones.get(cloneKey);if(existing)return existing;const set=read(b.set);set.expressID=-1;set.GlobalId=guid();const properties=new Map<number,any>();
    const copy=(refs:any[]):any[]=>refs.map(ref=>{const p=read(ref.value),old=p.expressID;p.expressID=-1;if(p.HasProperties)p.HasProperties=copy(p.HasProperties);if(p.HasQuantities)p.HasQuantities=copy(p.HasQuantities);const handle=write(p);properties.set(old,p);return handle;});
    if(set.HasProperties)set.HasProperties=copy(set.HasProperties);if(set.Quantities)set.Quantities=copy(set.Quantities);const setHandle=write(set);
    if(b.relation){const rel=read(b.relation);if(Array.isArray(rel.RelatingPropertyDefinition))throw Error('Editing multi-set IFC relationships is not supported.');rel.RelatedObjects=rel.RelatedObjects.filter((o:any)=>o.value!==id);if(rel.RelatedObjects.length)write(rel);else api.DeleteLine(m,rel.expressID);}
    create(IFC.IFCRELDEFINESBYPROPERTIES,guid(),owner,null,null,[new IFC.Handle(id)],setHandle);const clone={set,properties};clones.set(cloneKey,clone);return clone;
   };
  try{for(const edit of this.edits)for(const id of edit.ids){
   const root=read(id),owner=root.OwnerHistory;
   if(!edit.key){const p=create(IFC.IFCPROPERTYSINGLEVALUE,label(edit.name!),null,api.CreateIfcType(m,typeof edit.value==='number'?IFC.IFCREAL:typeof edit.value==='boolean'?IFC.IFCBOOLEAN:IFC.IFCTEXT,edit.value),null);const k=id+':'+edit.set;let set=customSets.get(k);if(!set){const binding=[...(this.bindings.get(id)?.values()||[])].find(b=>!b.inherited&&scalar(read(b.set).Name)===edit.set&&read(b.set).HasProperties);if(binding){set=ensureClone(id,binding,owner).set;customSets.set(k,set);}}if(set){set.HasProperties.push(p);write(set);}else{const s=create(IFC.IFCPROPERTYSET,guid(),owner,label(edit.set!),null,[p]);set=read(s.value);customSets.set(k,set);create(IFC.IFCRELDEFINESBYPROPERTIES,guid(),owner,null,null,[new IFC.Handle(id)],s);}continue;}
   const b=this.bindings.get(id)?.get(edit.key);
   if(!b&&!edit.key.startsWith('IFC · ')){const staged=this.edits.find(e=>!e.key&&e.ids.includes(id)&&e.set+' · '+e.name===edit.key);const set=staged&&customSets.get(id+':'+staged.set);const prop=set?.HasProperties.map((h:any)=>read(h.value)).find((p:any)=>scalar(p.Name)===staged?.name);if(!prop)throw Error('Custom property was not found.');prop.NominalValue=api.CreateIfcType(m,typeof edit.value==='number'?IFC.IFCREAL:typeof edit.value==='boolean'?IFC.IFCBOOLEAN:IFC.IFCTEXT,edit.value);write(prop);continue;}
   if(!b){const attr=edit.key.slice(6);root[attr]=label(String(edit.value));write(root);continue;}
   const clone=ensureClone(id,b,owner);
   const p=clone.properties.get(b.property);if(!p)throw Error('Property could not be cloned.');const previous=p[b.attribute];p[b.attribute]=previous?Object.assign(previous,{value:edit.value}):api.CreateIfcType(m,typeof edit.value==='number'?IFC.IFCREAL:typeof edit.value==='boolean'?IFC.IFCBOOLEAN:IFC.IFCTEXT,edit.value);write(p);
  }return api.SaveModel(m);}finally{api.CloseModel(m);}
 }
}
