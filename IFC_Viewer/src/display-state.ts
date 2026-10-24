export const palette = ['#2878cf','#d65c42','#27946d','#9763c2','#d79822','#d45291','#27a2aa','#7066d3','#8a9833','#b26d39','#678798','#a24967'];
export type DisplayAction = {kind:'colour';ids:number[];colour:string|null}|{kind:'groups';groups:number[][]}|{kind:'reset-colours'}|{kind:'visibility';ids:number[];visible:boolean}|{kind:'show-all'};
export class DisplayState {
 colours=new Map<number,string>();hidden=new Set<number>();selected:number[]=[];
 reset(){this.colours.clear();this.hidden.clear();this.selected=[];}
 change(action:DisplayAction){
  if(action.kind==='colour')for(const id of action.ids){if(action.colour)this.colours.set(id,action.colour);else this.colours.delete(id);}
  if(action.kind==='groups')action.groups.forEach((ids,index)=>{const colour=palette[index%palette.length];for(const id of ids)this.colours.set(id,colour);});
  if(action.kind==='reset-colours')this.colours.clear();
  if(action.kind==='visibility'){for(const id of action.ids){if(action.visible)this.hidden.delete(id);else this.hidden.add(id);}if(!action.visible)this.selected=this.selected.filter(id=>!this.hidden.has(id));}
  if(action.kind==='show-all')this.hidden.clear();
 }
 plan(){
  const batches=new Map<string,number[]>();
  for(const [id,colour]of this.colours){const ids=batches.get(colour)||[];ids.push(id);batches.set(colour,ids);}
  const selection=this.selected.filter(id=>!this.colours.has(id)&&!this.hidden.has(id));
  if(selection.length)batches.set('#e9b52f',[...(batches.get('#e9b52f')||[]),...selection]);
  return {hidden:[...this.hidden],batches:[...batches].map(([colour,ids])=>({colour,ids}))};
 }
}
export function orderedFields(columns:string[],groups:string[],order:string[]){
 const required=new Set(['quantity',...columns,...groups]);
 return [...new Set([...order.filter(k=>required.has(k)),...required])];
}
export function moveField(fields:string[],key:string,target:string){
 const from=fields.indexOf(key),to=fields.indexOf(target);if(from<0||to<0||from===to)return [...fields];
 const result=fields.filter(k=>k!==key);result.splice(to,0,key);return result;
}

export type DisplayPlan = ReturnType<DisplayState['plan']>;
// Compare against the last successfully applied state, not the last requested state.
export function displayDelta(previous:DisplayPlan,next:DisplayPlan){
 const before=new Map(previous.batches.flatMap(b=>b.ids.map(id=>[id,b.colour] as const)));
 const after=new Map(next.batches.flatMap(b=>b.ids.map(id=>[id,b.colour] as const)));
 const oldHidden=new Set(previous.hidden),newHidden=new Set(next.hidden);
 return {
  reset:[...before.keys()].filter(id=>!after.has(id)),
  show:previous.hidden.filter(id=>!newHidden.has(id)),
  hide:next.hidden.filter(id=>!oldHidden.has(id)),
  batches:next.batches.map(b=>({...b,ids:b.ids.filter(id=>before.get(id)!==b.colour)})).filter(b=>b.ids.length),
 };
}
