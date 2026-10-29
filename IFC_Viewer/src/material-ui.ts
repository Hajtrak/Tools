import {palette,orderedFields,moveField, type DisplayState,type DisplayAction} from './display-state';
import {labels,defaults,display,tableRows,exportText,type Row,type TableRow} from './material-data';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const button=(text:string,action:()=>void)=>{const b=document.createElement('button');b.textContent=text;b.onclick=action;return b;};
export function materialUI(select:(ids:number[])=>Promise<void>,resize:()=>void,onError:(e:unknown)=>void,view:DisplayState,changeDisplay:(action:DisplayAction)=>Promise<void>){
 let rows:Row[]=[],fields:string[]=[],selected:number[]=[];let current:TableRow[]=[];let sort='',descending=false,limit=500,file='';
 let columnOrder:string[]=[];
 let tableCache:{signature:string;data:TableRow[]}|undefined;
 let renderedRows:{element:HTMLTableRowElement;ids:number[]}[]=[];
 let memberFields:string[]=[],columns:string[]=[],groups:string[]=[];
 let configured=false;
 try{const saved=JSON.parse(localStorage.getItem('ifc-viewer-fields-v2')||'null');if(saved){configured=true;for(const key of ['member','columns','groups'])if(!Array.isArray(saved[key])||!saved[key].every((s:unknown)=>typeof s==='string'))throw 0;memberFields=saved.member;columns=saved.columns;groups=saved.groups;if(Array.isArray(saved.order)&&saved.order.every((s:unknown)=>typeof s==='string'))columnOrder=saved.order;}}catch{}
 const persist=()=>{configured=true;try{localStorage.setItem('ifc-viewer-fields-v2',JSON.stringify({member:memberFields,columns,groups,order:columnOrder}));}catch{}};
 const label=(key:string)=>labels[key]||key;
 const keys=()=>orderedFields(columns,groups,columnOrder);
 const act=(action:DisplayAction)=>void changeDisplay(action).catch(onError);
 let colourIds:number[]=[];
 function chooseColour(ids:number[]){
  colourIds=[...ids];$('colour-scope').textContent=`Apply a colour to ${ids.length} ${ids.length===1?'member':'members'}.`;
  $<HTMLDialogElement>('colour-dialog').showModal();
 }
 function paint(colour:string|null){act({kind:'colour',ids:colourIds,colour});$<HTMLDialogElement>('colour-dialog').close();}
 const namedColours=['Blue','Terracotta','Green','Purple','Amber','Pink','Turquoise','Violet','Olive','Brown','Slate','Rose'];
 palette.forEach((colour,index)=>{const b=button(namedColours[index],()=>paint(colour));b.style.setProperty('--swatch',colour);b.className='palette-colour';b.title=colour;$('colour-palette').append(b);});
 $('colour-close').onclick=()=>$<HTMLDialogElement>('colour-dialog').close();
 $('apply-colour').onclick=()=>paint($<HTMLInputElement>('custom-colour').value);
 $('original-colour').onclick=()=>paint(null);
 $('member-colour').onclick=()=>chooseColour(selected);
 $('member-visibility').onclick=()=>act({kind:'visibility',ids:selected,visible:selected.every(id=>view.hidden.has(id))});
 $('colour-groups').onclick=()=>act({kind:'groups',groups:current.map(r=>r.ids)});
 $('reset-colours').onclick=()=>act({kind:'reset-colours'});
 $('show-all').onclick=()=>act({kind:'show-all'});
 function reorder(key:string,target:string){columnOrder=moveField(keys(),key,target);persist();render();renderOrder();}
 let draggedField:{key:string;x:number;y:number;active:boolean}|undefined;
 let suppressSortUntil=0;
 function renderOrder(){
  const host=$('column-order');host.replaceChildren();host.hidden=mode!=='columns';if(mode!=='columns')return;
  const title=document.createElement('p');title.textContent='Column order — move with the arrows, or drag headings in the list.';host.append(title);
  const visible=keys();visible.forEach((key,index)=>{const row=document.createElement('div');row.className='order-row';const text=document.createElement('span');text.textContent=label(key);row.append(text);
   for(const direction of [-1,1]){const b=button(direction<0?'↑':'↓',()=>reorder(key,visible[index+direction]));b.title=`Move ${label(key)} ${direction<0?'left':'right'}`;b.setAttribute('aria-label',b.title);b.disabled=index+direction<0||index+direction>=visible.length;row.append(b);}host.append(row);
  });
 }
 function member(){
  const host=$('member-values');host.replaceChildren();
  if(!selected.length){$('member').hidden=true;return;}
  $('member').hidden=false;
  $('member-visibility').textContent=selected.every(id=>view.hidden.has(id))?'Show selected':'Hide selected';
  const selectedIds=new Set(selected);
  const chosen=rows.filter(r=>selectedIds.has(r.id));
  $('member-heading').textContent=chosen.length===1?String(chosen[0].values['IFC · Name']||chosen[0].values.reference||chosen[0].values.name||'Selected member'):`${chosen.length} members selected`;
  for(const key of memberFields){const dt=document.createElement('dt');dt.textContent=label(key);const dd=document.createElement('dd');
   const vals=chosen.map(r=>r.values[key]);const same=vals.every(v=>v===vals[0]);
   dd.textContent=same?display(vals[0]):'(varies)';
   if(chosen.length===1&&chosen[0].sources[key]){const small=document.createElement('small');small.textContent=chosen[0].sources[key];dd.append(small);}
   host.append(dt,dd);
  }
 }
 function render(){
  const head=$('table-head'),body=$('table-body');head.replaceChildren();body.replaceChildren();
  const search=$<HTMLInputElement>('search').value;
  const signature=JSON.stringify([groups,search,sort,descending]);
  if(tableCache?.signature!==signature)tableCache={signature,data:tableRows(rows,groups,search,sort,descending)};
  current=tableCache.data;
  renderedRows=[];
  const selectedIds=new Set(selected);
  const visibleKeys=keys();
  const tr=document.createElement('tr');const actionHead=document.createElement('th');actionHead.className='row-actions';actionHead.textContent='Display';tr.append(actionHead);
  for(const key of visibleKeys){const th=document.createElement('th');th.dataset.column=key;th.classList.add('movable-column');th.title='Drag to reorder this column';
   th.onpointerdown=e=>{if(e.button!==0)return;draggedField={key,x:e.clientX,y:e.clientY,active:false};th.setPointerCapture(e.pointerId);};
   th.onpointermove=e=>{if(!draggedField||!th.hasPointerCapture(e.pointerId))return;if(Math.hypot(e.clientX-draggedField.x,e.clientY-draggedField.y)>6){draggedField.active=true;th.classList.add('dragging-column');}};
   th.onpointerup=e=>{const drag=draggedField;draggedField=undefined;th.classList.remove('dragging-column');if(!drag?.active)return;
    suppressSortUntil=performance.now()+300;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('th[data-column]')?.dataset.column;
    if(target)reorder(drag.key,target);
   };
   th.onpointercancel=()=>{draggedField=undefined;th.classList.remove('dragging-column');};
   th.onclick=()=>{if(performance.now()<suppressSortUntil)return;descending=sort===key?!descending:false;sort=key;render();};
   th.append(button(label(key)+(sort===key?(descending?' ↓':' ↑'):''),()=>{}));tr.append(th);
  }head.append(tr);
  for(const row of current.slice(0,limit)){const tr=document.createElement('tr');tr.tabIndex=0;tr.classList.toggle('selected',row.ids.some(id=>selectedIds.has(id)));renderedRows.push({element:tr,ids:row.ids});
   const allHidden=row.ids.every(id=>view.hidden.has(id));
   tr.classList.toggle('hidden-member',allHidden);
   const actions=document.createElement('td');actions.className='row-actions';
   const colour=button('Colour',()=>chooseColour(row.ids));colour.className='row-colour';colour.title=`Set colour for ${row.ids.length} ${row.ids.length===1?'member':'members'}`;
   const colours=new Set(row.ids.map(id=>view.colours.get(id)||''));
   if(colours.size===1&&[...colours][0])colour.style.setProperty('--swatch',[...colours][0]);else if(colours.size>1)colour.classList.add('mixed-colours');
   const visibility=button(allHidden?'Show':'Hide',()=>act({kind:'visibility',ids:row.ids,visible:allHidden}));visibility.title=allHidden?'Show these members in 3D':'Hide these members in 3D';
   actions.onclick=e=>e.stopPropagation();actions.onkeydown=e=>e.stopPropagation();actions.append(colour,visibility);tr.append(actions);
   const activate=(e?:MouseEvent)=>void select(e?.ctrlKey||e?.metaKey?[...new Set([...selected.filter(id=>!row.ids.includes(id)),...row.ids.filter(id=>!selected.includes(id))])]:row.ids).catch(onError);tr.onclick=activate;tr.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();activate();}};
   for(const key of visibleKeys){const td=document.createElement('td');td.textContent=display(row.values[key]);td.title=td.textContent;tr.append(td);}body.append(tr);
  }
  $('row-count').textContent=`· ${current.length} ${groups.length?'groups':'members'}`;
  $('group-summary').textContent=groups.length?'Grouped by '+groups.map(label).join(' / ')+'. Different values are shown as (varies).':'';
  const matchingIds=new Set(current.flatMap(c=>c.ids));
  const matching=rows.filter(r=>matchingIds.has(r.id));
  const total=(key:string)=>{const present=matching.filter(r=>typeof r.values[key]==='number');const sum=present.reduce((n,r)=>n+(r.values[key] as number),0);return `${display(sum)} ${key==='length'?'m':'kg'} (${present.length}/${matching.length} with values)`;};
  $('list-summary').textContent=rows.length?`${matching.length} elements. Export includes all matching rows. Raw property values retain IFC units.`:'No member information loaded.';
  $('display-summary').textContent=`${view.hidden.size} hidden · ${view.colours.size} coloured. Hidden members stay in the list and exports.`;
  $<HTMLButtonElement>('colour-groups').disabled=!groups.length||!current.length;
  $<HTMLButtonElement>('reset-colours').disabled=!view.colours.size;
  $<HTMLButtonElement>('show-all').disabled=!view.hidden.size;
  $('more-rows').hidden=current.length<=limit;
  for(const key of ['export-csv','export-txt'])$<HTMLButtonElement>(key).disabled=!rows.length;
 }
 let mode:'member'|'columns'|'groups'='member';
 function options(){
  const chosen=mode==='member'?memberFields:mode==='columns'?columns:groups;
  const host=$('field-options');host.replaceChildren();const search=$<HTMLInputElement>('field-search').value.toLowerCase();
  const available=[...new Set([...fields,...chosen])];
  for(const key of available.filter(k=>label(k).toLowerCase().includes(search))){
   const el=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=chosen.includes(key);
   input.onchange=()=>{const index=chosen.indexOf(key);if(input.checked&&index<0)chosen.push(key);else if(index>=0)chosen.splice(index,1);persist();member();render();renderOrder();};
   const text=document.createElement('span');text.textContent=label(key)+(fields.includes(key)||key in labels?'':' (not in this model)');el.append(input,text);host.append(el);
  }
 }
 function choose(m:typeof mode){mode=m;$('fields-title').textContent=m==='member'?'Member information fields':m==='columns'?'Material list columns':'Group material list';$('fields-note').textContent=m==='groups'?'Select one or more fields. Clear all to see individual members. Values are grouped exactly; different lengths stay separate.':'Standard fields appear first, followed by all exported IFC properties. Raw property values retain the source IFC units.';$<HTMLInputElement>('field-search').value='';options();renderOrder();$<HTMLDialogElement>('fields-dialog').showModal();}
 $('member-fields').onclick=()=>choose('member');$('list-fields').onclick=()=>choose('columns');$('group-fields').onclick=()=>choose('groups');$('field-search').oninput=options;$('fields-close').onclick=()=>$<HTMLDialogElement>('fields-dialog').close();
 $('close-member').onclick=()=>void select([]).catch(onError);
 $('select-matching').onclick=()=>void select(current.flatMap(r=>r.ids)).catch(onError);
 $('search').oninput=()=>{limit=500;render();};$('more-rows').onclick=()=>{limit+=500;render();};
 const toggle=()=>{$('materials').hidden=!$('materials').hidden;resize();};$('toggle-list').onclick=toggle;$('close-list').onclick=toggle;
 let start=0,height=0;const grip=$('list-resize');
 grip.onpointerdown=e=>{start=e.clientY;height=$('materials').clientHeight;grip.setPointerCapture(e.pointerId);};grip.onpointermove=e=>{if(grip.hasPointerCapture(e.pointerId)){$('materials').style.height=Math.max(150,height+start-e.clientY)+'px';resize();}};
 for(const format of ['csv','txt'] as const)$('export-'+format).onclick=async()=>{try{const name=await window.desktop.saveExport(format,exportText(current,keys(),format),file.replace(/\.ifc$/i,'')+' - material list');if(name)$('list-summary').textContent=`Saved ${name} · ${current.length} rows exported`;}catch(e){onError(e);}};
 return {
  reset(){$<HTMLDialogElement>('colour-dialog').close();$<HTMLDialogElement>('fields-dialog').close();rows=[];tableCache=undefined;renderedRows=[];colourIds=[];selected=[];fields=[];file='';member();render();},
  setRows(data:Row[],filename:string){rows=data;tableCache=undefined;file=filename;fields=[...new Set(rows.flatMap(r=>Object.keys(r.values)))].sort();if(!configured){memberFields=[...fields];columns=[...fields];groups=[];}selected=[];$<HTMLInputElement>('search').value='';limit=500;member();render();$('materials').hidden=false;resize();},
  setSelection(ids:number[],displayChanged=true){selected=ids;member();if(displayChanged)render();else{const chosen=new Set(ids);for(const row of renderedRows)row.element.classList.toggle('selected',row.ids.some(id=>chosen.has(id)));}},
  refresh(){tableCache=undefined;fields=[...new Set(rows.flatMap(r=>Object.keys(r.values)))].sort();if(!configured){memberFields=[...fields];columns=[...fields];}member();render();},
  getSelection:()=>selected,
  status(text:string){$('list-summary').textContent=text;},
  getRows:()=>rows,
 };
}
